'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'

/* ─── Constants ──────────────────────────────────────────────────── */
const DAYS_SHORT = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob']
const MONTHS_PL  = ['stycznia','lutego','marca','kwietnia','maja','czerwca',
                    'lipca','sierpnia','września','października','listopada','grudnia']

const SHOW_TYPES = new Set(['Spektakl', 'Spektakl gościnny', 'Premiera'])

const PROD_COLORS = ['bg-gray-100 text-gray-600']

const STATUS_LABEL: Record<string, string> = {
  'Na urlopie':    'Urlop',
  'Choroba':       'Choroba',
  'Niedyspozyjny': 'Niedyspozycyjny',
  'Nieaktywny':    'Nieaktywny',
}

/* ─── Types ──────────────────────────────────────────────────────── */
interface EventRow {
  id: string; title: string; start_time: string; end_time: string
  location: string | null; type: string | null
  production_title: string | null; artist_ids: string[]
}
interface ArtistRow { id: string; name: string; status: string | null; role: string | null }
interface TechRow   { id: string; name: string; role: string | null; status: string | null; eventCount: number }
interface ProdRow   { id: string; title: string; status: string }
interface AvailRow  { artist_id: string; type: string; start_time: string; end_time: string }

/* ─── Helpers ────────────────────────────────────────────────────── */
function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
}
function prodColor(title: string) {
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PROD_COLORS[h % PROD_COLORS.length]
}
function mapEvent(e: any): EventRow {
  const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
  return { id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time,
           location: e.location ?? null, type: e.type ?? null,
           production_title: prod?.title ?? null,
           artist_ids: (e.event_artists ?? []).map((ea: any) => ea.artist_id) }
}
function findConflictPairs(events: EventRow[]): { a: EventRow; b: EventRow }[] {
  const pairs: { a: EventRow; b: EventRow }[] = []
  for (let i = 0; i < events.length; i++)
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j]
      if (!(new Date(a.start_time) < new Date(b.end_time) && new Date(b.start_time) < new Date(a.end_time))) continue
      if (a.artist_ids.some(id => b.artist_ids.includes(id))) pairs.push({ a, b })
    }
  return pairs
}

/* ─── Tooltip component ──────────────────────────────────────────── */
function Tooltip({ children, tip, align = 'left' }: {
  children: React.ReactNode
  tip: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const [show, setShow] = useState(false)
  const alignCls = align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className={`absolute top-full mt-1.5 ${alignCls} z-[200] pointer-events-none`}>
          <span className="block bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden min-w-[210px] max-w-[300px]">
            {tip}
          </span>
        </span>
      )}
    </span>
  )
}

/* ─── Tooltip content helpers ────────────────────────────────────── */
function TipHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">{children}</p>
}
function TipRow({ label, sub, dot }: { label: string; sub?: string; dot?: string }) {
  return (
    <span className="flex items-start gap-2 px-3 py-1.5">
      {dot && <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />}
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-gray-800 truncate">{label}</span>
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </span>
    </span>
  )
}
function TipEmpty({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 px-3 py-2.5 italic">{text}</p>
}
function TipDivider() { return <span className="block h-px bg-gray-100 mx-3" /> }

/* ─── Page ───────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { selectedTheatreId } = useTheatre()

  const [loading,       setLoading]       = useState(true)
  const [artistCount,   setArtistCount]   = useState(0)
  const [unavailList,   setUnavailList]   = useState<ArtistRow[]>([])
  const [weekEvCount,   setWeekEvCount]   = useState(0)
  const [weekShows,     setWeekShows]     = useState<EventRow[]>([])
  const [activeProd,    setActiveProd]    = useState(0)
  const [inPrepList,    setInPrepList]    = useState<ProdRow[]>([])
  const [conflictPairs, setConflictPairs] = useState<{ a: EventRow; b: EventRow }[]>([])
  const [todayEvents,   setTodayEvents]   = useState<EventRow[]>([])
  const [upcoming,      setUpcoming]      = useState<EventRow[]>([])
  const [alertArtists,  setAlertArtists]  = useState<ArtistRow[]>([])
  const [artistAvails,  setArtistAvails]  = useState<AvailRow[]>([])
  const [availCounts,   setAvailCounts]   = useState({ dostepni: 0, urlop: 0, niedostepni: 0 })
  const [techToday,     setTechToday]     = useState<TechRow[]>([])
  const [nextPremiere,  setNextPremiere]  = useState<EventRow | null>(null)

  useEffect(() => { fetchAll() }, [selectedTheatreId])

  async function fetchAll() {
    setLoading(true)
    const now     = new Date()
    const today   = localDate(now)
    const weekEnd = localDate(addDays(now, 7))
    const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    const evSel = 'id, title, start_time, end_time, location, type, productions(title), event_artists(artist_id)'

    const todayQ   = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T00:00:00`).lte('start_time', `${today}T23:59:59`).order('start_time')
    const weekQ    = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T00:00:00`).lt('start_time', `${weekEnd}T00:00:00`).order('start_time')
    const upcomQ   = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T${nowTime}:00`)
      .lt('start_time', `${localDate(addDays(now, 14))}T00:00:00`)
      .order('start_time').limit(15)
    const premiereQ = supabase.from('events').select(evSel)
      .eq('type', 'Premiera').gte('start_time', `${today}T00:00:00`).order('start_time').limit(1)

    let prodQ = supabase.from('productions').select('id, title, status')
    if (selectedTheatreId) prodQ = prodQ.eq('theatre_id', selectedTheatreId)

    const [
      { data: artistData },
      { data: prodsData },
      { data: todayEvData },
      { data: weekEvData },
      { data: upcomData },
      { data: premiereData },
      { data: techTeam },
    ] = await Promise.all([
      supabase.from('artists').select('id, name, status, role'),
      prodQ,
      todayQ, weekQ, upcomQ, premiereQ,
      supabase.from('teams').select('id').eq('name', 'Technique').single(),
    ])

    const artists: ArtistRow[] = artistData ?? []
    const prods   = (prodsData ?? []) as ProdRow[]
    const unavail = artists.filter(a => a.status && a.status !== 'Aktywny')

    setArtistCount(artists.length)
    setUnavailList(unavail)
    setActiveProd(prods.filter(p => p.status === 'Na afiszu').length)
    setInPrepList(prods.filter(p => ['W produkcji', 'Koncepcja'].includes(p.status)))

    const weekEvs = (weekEvData ?? []).map(mapEvent)
    const pairs   = findConflictPairs(weekEvs)
    setWeekEvCount(weekEvs.filter(e => !SHOW_TYPES.has(e.type ?? '')).length)
    setWeekShows(weekEvs.filter(e => SHOW_TYPES.has(e.type ?? '')))
    setConflictPairs(pairs)

    const todayMapped = (todayEvData ?? []).map(mapEvent)
    setTodayEvents(todayMapped)
    setUpcoming((upcomData ?? []).map(mapEvent))
    setNextPremiere(premiereData?.[0] ? mapEvent(premiereData[0]) : null)

    setAlertArtists(unavail)
    setAvailCounts({
      dostepni:    artists.filter(a => !a.status || a.status === 'Aktywny').length,
      urlop:       artists.filter(a => a.status === 'Na urlopie').length,
      niedostepni: artists.filter(a => a.status && ['Choroba','Niedyspozyjny'].includes(a.status)).length,
    })

    // Fetch vacation/sick dates for unavailable artists
    const unavailIds = unavail.map(a => a.id)
    if (unavailIds.length > 0) {
      const { data: avData } = await supabase
        .from('availabilities').select('artist_id, type, start_time, end_time')
        .in('artist_id', unavailIds).in('type', ['Urlop', 'Choroba'])
        .gte('end_time', `${today}T00:00:00`).order('start_time')
      setArtistAvails(avData ?? [])
    } else {
      setArtistAvails([])
    }

    if (techTeam?.id) {
      const { data: techArtists } = await supabase
        .from('artists').select('id, name, role, status').eq('team_id', techTeam.id).order('name')
      setTechToday((techArtists ?? []).map(a => ({
        id: a.id, name: a.name, role: a.role, status: a.status,
        eventCount: todayMapped.filter(e => e.artist_ids.includes(a.id)).length,
      })))
    }

    setLoading(false)
  }

  /* ── Derived ── */
  const now      = new Date()
  const dayLabel = `${DAYS_SHORT[now.getDay()]}. ${now.getDate()} ${MONTHS_PL[now.getMonth()]}`
  const total    = Math.max(availCounts.dostepni + availCounts.urlop + availCounts.niedostepni, 1)
  const pctD = (availCounts.dostepni    / total) * 100
  const pctU = (availCounts.urlop       / total) * 100
  const pctN = (availCounts.niedostepni / total) * 100

  let daysToPremi: number | null = null
  if (nextPremiere) {
    const diff = Math.ceil((new Date(nextPremiere.start_time).getTime() - now.getTime()) / 86400000)
    daysToPremi = diff >= 0 ? diff : null
  }

  /* ── Tooltip content builders ── */
  const unavailTip = (
    <>
      <TipHeader>Niedostępni</TipHeader>
      {unavailList.length === 0
        ? <TipEmpty text="Wszyscy dostępni" />
        : unavailList.map(a => {
            const dot = a.status === 'Na urlopie' ? 'bg-amber-400' : 'bg-red-400'
            return <TipRow key={a.id} label={a.name} sub={STATUS_LABEL[a.status!] ?? a.status!} dot={dot} />
          })
      }
      <span className="block pb-1" />
    </>
  )

  const showsTip = (
    <>
      <TipHeader>Spektakle w tym tygodniu</TipHeader>
      {weekShows.length === 0
        ? <TipEmpty text="Brak spektakli" />
        : weekShows.map(e => (
            <TipRow key={e.id}
              label={e.title}
              sub={`${DAYS_SHORT[new Date(e.start_time).getDay()]} ${new Date(e.start_time).getDate()} · ${fmtTime(e.start_time)}`}
              dot="bg-green-400" />
          ))
      }
      <span className="block pb-1" />
    </>
  )

  const inPrepTip = (
    <>
      <TipHeader>W przygotowaniu</TipHeader>
      {inPrepList.length === 0
        ? <TipEmpty text="Brak" />
        : inPrepList.map(p => (
            <TipRow key={p.id} label={p.title}
              sub={p.status}
              dot={p.status === 'W produkcji' ? 'bg-blue-400' : 'bg-slate-300'} />
          ))
      }
      <span className="block pb-1" />
    </>
  )

  const conflictTip = (
    <>
      <TipHeader>Nakładające się próby</TipHeader>
      {conflictPairs.length === 0
        ? <TipEmpty text="Brak konfliktów" />
        : conflictPairs.map((p, i) => (
            <span key={i} className="block">
              {i > 0 && <TipDivider />}
              <TipRow label={p.a.title} sub={`${fmtTime(p.a.start_time)}–${fmtTime(p.a.end_time)}`} dot="bg-red-400" />
              <TipRow label={p.b.title} sub={`${fmtTime(p.b.start_time)}–${fmtTime(p.b.end_time)}`} dot="bg-red-300" />
            </span>
          ))
      }
      <span className="block pb-1" />
    </>
  )

  function alertTip(status: string) {
    const icon = status === 'Na urlopie' ? '🏖️' : '🤒'
    const group = alertArtists.filter(a => a.status === status)
    return (
      <>
        <TipHeader>{STATUS_LABEL[status] ?? status}</TipHeader>
        {group.map(a => {
          const avail = artistAvails.filter(av => av.artist_id === a.id && av.type === (status === 'Na urlopie' ? 'Urlop' : 'Choroba'))
          const latest = avail[avail.length - 1]
          const dateStr = latest ? `${fmtDate(latest.start_time)} – ${fmtDate(latest.end_time)}` : undefined
          return <TipRow key={a.id} label={a.name} sub={dateStr} dot={status === 'Na urlopie' ? 'bg-amber-400' : 'bg-red-400'} />
        })}
        <span className="block pb-1" />
      </>
    )
  }

  /* ── Stat cards config ── */
  const statCards = [
    {
      label: 'Artyści', value: artistCount,
      sub: `${unavailList.length} niedostępnych`, warn: unavailList.length > 0,
      tip: unavailTip, tipAlign: 'left' as const,
    },
    {
      label: 'Próby w tygodniu', value: weekEvCount,
      sub: `${weekShows.length} spektakle`, warn: false,
      tip: showsTip, tipAlign: 'left' as const,
    },
    {
      label: 'Aktywne produkcje', value: activeProd,
      sub: `${inPrepList.length} w przygotowaniu`, warn: false,
      tip: inPrepTip, tipAlign: 'left' as const,
    },
    {
      label: 'Konflikty grafiku', value: conflictPairs.length,
      sub: 'wymagają uwagi', warn: conflictPairs.length > 0,
      tip: conflictTip, tipAlign: 'right' as const,
    },
  ]

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          <span className="text-sm">Ładowanie dashboardu…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex flex-col gap-1">
            <p className="text-xs text-gray-400 font-medium">{s.label}</p>
            <p className="text-4xl font-bold text-gray-900 leading-none mt-1">{s.value}</p>
            <Tooltip tip={s.tip} align={s.tipAlign}>
              <span className={`text-xs font-medium mt-1 underline decoration-dotted underline-offset-2 cursor-help transition-colors
                ${s.warn ? 'text-red-500 decoration-red-300' : 'text-gray-400 decoration-gray-300'}`}>
                {s.sub}
              </span>
            </Tooltip>
          </div>
        ))}
      </div>

      {/* ── Next premiere banner ─────────────────────────────────── */}
      {nextPremiere && daysToPremi !== null && (
        <div className="bg-gray-900 rounded-2xl px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <div className="text-3xl">🌟</div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Najbliższa premiera</p>
              <Link href="/productions"
                className="text-lg font-bold mt-0.5 hover:underline decoration-white/60 underline-offset-2 block">
                {nextPremiere.production_title ?? nextPremiere.title}
              </Link>
              <p className="text-sm text-gray-400 mt-0.5">
                {new Date(nextPremiere.start_time).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                {nextPremiere.location ? ` · ${nextPremiere.location}` : ''}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 pl-4">
            <p className="text-5xl font-black leading-none">{daysToPremi}</p>
            <p className="text-sm text-gray-400 mt-1">{daysToPremi === 1 ? 'dzień' : 'dni'}</p>
          </div>
        </div>
      )}

      {/* ── 3-column body ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-5 items-start">

        {/* LEFT — Today ─────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Dzisiaj — {dayLabel}</h3>
            {todayEvents.length > 0 && (
              <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                {todayEvents.length} {todayEvents.length === 1 ? 'wydarzenie' : 'wydarzeń'}
              </span>
            )}
          </div>

          {todayEvents.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-xs">Brak wydarzeń dzisiaj</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayEvents.map(ev => (
                <div key={ev.id} className="flex gap-3 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-400 w-10 shrink-0 pt-0.5 tabular-nums">
                    {fmtTime(ev.start_time)}
                  </div>
                  <div className="border-l-2 border-gray-300 pl-3 flex-1 min-w-0">
                    <Link href="/calendar"
                      className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors truncate block">
                      {ev.title}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[ev.location, `do ${fmtTime(ev.end_time)}`].filter(Boolean).join(' · ')}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {ev.production_title && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {ev.production_title}
                        </span>
                      )}
                      {ev.artist_ids.length > 0 && (
                        <span className="text-[11px] text-gray-400">{ev.artist_ids.length} os.</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MIDDLE — Upcoming ──────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Nadchodzące wydarzenia</h3>
            <span className="text-xs text-gray-400">14 dni</span>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-2xl mb-2">📅</p>
              <p className="text-xs">Brak zaplanowanych wydarzeń</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming.map((ev, idx) => {
                const d      = new Date(ev.start_time)
                const isPrem = ev.type === 'Premiera'
                const isShow = SHOW_TYPES.has(ev.type ?? '')
                const prevD  = idx > 0 ? new Date(upcoming[idx-1].start_time) : null
                const newDay = !prevD || d.toDateString() !== prevD.toDateString()

                return (
                  <div key={ev.id}>
                    {newDay && (
                      <div className="flex items-center gap-3 px-5 pt-3 pb-1">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                          {DAYS_SHORT[d.getDay()]} {d.getDate()} {MONTHS_PL[d.getMonth()]}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    )}
                    <div className="flex gap-4 px-5 py-3">
                      <div className="w-10 shrink-0 pt-0.5">
                        <span className="text-xs font-semibold tabular-nums text-gray-500">
                          {fmtTime(ev.start_time)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href="/calendar"
                          className="text-sm font-semibold leading-snug hover:underline underline-offset-2 block text-gray-900 decoration-gray-400">
                          {ev.title}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {ev.type && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {ev.type}
                            </span>
                          )}
                          {ev.production_title && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {ev.production_title}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Alerty */}
          {(alertArtists.length > 0 || conflictPairs.length > 0) && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Alerty</h3>
              <div className="space-y-2">

                {conflictPairs.length > 0 && (
                  <Tooltip tip={conflictTip} align="right">
                    <span className="flex items-start gap-2.5 px-3 py-2.5 bg-red-50 rounded-xl border border-red-100 cursor-help w-full">
                      <span className="text-base shrink-0">⚠️</span>
                      <span>
                        <p className="text-xs font-semibold text-red-700">Konflikty grafiku</p>
                        <p className="text-xs text-red-500 mt-0.5 underline decoration-dotted underline-offset-2">
                          {conflictPairs.length} nakładających się prób
                        </p>
                      </span>
                    </span>
                  </Tooltip>
                )}

                {(['Na urlopie','Choroba','Niedyspozyjny'] as const).map(status => {
                  const group = alertArtists.filter(a => a.status === status)
                  if (!group.length) return null
                  const icon  = status === 'Na urlopie' ? '🏖️' : status === 'Choroba' ? '🤒' : '🚫'
                  const label = STATUS_LABEL[status]
                  return (
                    <Tooltip key={status} tip={alertTip(status)} align="right">
                      <span className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 rounded-xl border border-amber-100 cursor-help w-full">
                        <span className="text-base shrink-0">{icon}</span>
                        <span>
                          <p className="text-xs font-semibold text-amber-700">{label}</p>
                          <p className="text-xs text-amber-600 mt-0.5 underline decoration-dotted underline-offset-2">
                            {group.map(a => a.name.split(' ')[0]).join(', ')}
                          </p>
                        </span>
                      </span>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )}

          {/* Dostępność */}
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Dostępność zespołu</h3>
            <div className="flex h-2 rounded-full overflow-hidden mb-3 gap-0.5">
              {pctD > 0 && <div className="bg-green-400 rounded-full" style={{ width: `${pctD}%` }} />}
              {pctU > 0 && <div className="bg-amber-400 rounded-full" style={{ width: `${pctU}%` }} />}
              {pctN > 0 && <div className="bg-red-400 rounded-full" style={{ width: `${pctN}%` }} />}
            </div>
            <div className="space-y-2">
              {[
                { label: 'Dostępni',        count: availCounts.dostepni,    color: 'bg-green-400' },
                { label: 'Urlop',           count: availCounts.urlop,       color: 'bg-amber-400' },
                { label: 'Niedyspozycyjni', count: availCounts.niedostepni, color: 'bg-red-400'   },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${r.color} shrink-0`} />
                    <span className="text-xs text-gray-600">{r.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-800">{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Technika dziś */}
          {techToday.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Technika dziś</h3>
              <div className="space-y-2.5">
                {techToday.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      !m.status || m.status === 'Aktywny' ? 'bg-green-400' :
                      m.status === 'Na urlopie'           ? 'bg-amber-400' : 'bg-red-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{m.name}</p>
                      {m.role && <p className="text-[10px] text-gray-400 truncate">{m.role}</p>}
                    </div>
                    {m.eventCount > 0 && (
                      <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 shrink-0">
                        {m.eventCount} zm.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
