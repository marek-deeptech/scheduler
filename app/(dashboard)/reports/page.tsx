'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import { useLanguage } from '@/lib/language-context'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { findConflicts } from '@/lib/conflicts'
import { sortByLastName } from '@/lib/names'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventRow {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  production_id: string | null
  theatre_id: string | null
  room_id: string | null
  productions: { title: string } | null
  theatres:    { name: string }  | null
  rooms:       { name: string }  | null
  event_artists: { artist_id: string }[]
}

interface ArtistRow {
  id: string
  name: string
  status: string | null
}

interface AvailRow {
  artist_id: string
  type: string
  start_time: string
  end_time: string
}

interface ProdMeta {
  id: string
  title: string
  status: string | null
  theatreName: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REHEARSAL_TYPES = new Set([
  'Próba stolikowa','Próba sytuacyjna','Próba techniczna','Próba muzyczna',
  'Próba choreograficzna','Próba kostiumowa','Próba generalna','Próba z publicznością',
])
const SHOW_TYPES    = new Set(['Premiera','Spektakl','Spektakl gościnny'])
const FITTING_TYPES = new Set(['Przymiarki kostiumowe'])

// PERIOD_OPTIONS built inside component (locale-aware)

const COLORS = ['#c8102e','#d97706','#16a34a','#7c3aed','#0891b2','#db2777','#4b5563']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function periodRange(period: string): { start: string; end: string } {
  const now = new Date()
  if (period === 'week') {
    const day = (now.getDay() + 6) % 7
    const mon = new Date(now); mon.setDate(now.getDate() - day)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: localDate(mon), end: localDate(sun) }
  }
  if (period === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start: localDate(s), end: localDate(e) }
  }
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
}

function hours(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000
}

function shortName(name: string) {
  const p = name.trim().split(' ')
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length-1][0]}.`
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill ?? p.color }}>
          <span className="font-medium">{p.name}:</span>{' '}
          {typeof p.value === 'number' && p.value % 1 !== 0 ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { selectedTheatreId } = useTheatre()
  const { t, locale } = useLanguage()
  const tr = t.reports
  const td = t.dashboard
  const localeStr = locale === 'pl' ? 'pl-PL' : 'en-US'

  const PERIOD_OPTIONS = [
    { value: 'week',  label: tr.periodWeek  },
    { value: 'month', label: tr.periodMonth },
    { value: 'year',  label: tr.periodYear  },
  ]

  const [period,      setPeriod]      = useState('week')
  const [events,      setEvents]      = useState<EventRow[]>([])
  const [artists,     setArtists]     = useState<ArtistRow[]>([])
  const [avails,      setAvails]      = useState<AvailRow[]>([])
  const [productions, setProductions] = useState<ProdMeta[]>([])
  const [loading,     setLoading]     = useState(true)
  const [assignments, setAssignments] = useState<{ artist_id: string; production_id: string; theatre_id: string | null }[]>([])
  // Obciążenie zespołu — filtr po miesiącu/roku
  const [wlMonth,     setWlMonth]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const [wlEvents,    setWlEvents]    = useState<EventRow[]>([])
  const [wlVac,       setWlVac]       = useState<{ artist_id: string; start_time: string; end_time: string }[]>([])

  const today = localDate(new Date())

  useEffect(() => { load() }, [period, selectedTheatreId])

  async function load() {
    setLoading(true)
    const { start, end } = periodRange(period)

    let evQ = supabase
      .from('events')
      .select('id,title,type,start_time,end_time,production_id,theatre_id,room_id,productions(title),theatres(name),rooms(name),event_artists(artist_id)')
      .gte('start_time', `${start}T00:00:00`)
      .lte('start_time', `${end}T23:59:59`)
      .order('start_time')
    if (selectedTheatreId) evQ = evQ.eq('theatre_id', selectedTheatreId)

    let prodQ = supabase
      .from('productions')
      .select('id,title,status,theatre_id,theatres(name)')
    if (selectedTheatreId) prodQ = prodQ.eq('theatre_id', selectedTheatreId)

    // Aktualne przypisania (w ilu tytułach gra obecnie) + mapa produkcja→aktorzy
    let assignQ = supabase.from('artist_productions').select('artist_id, production_id, productions(theatre_id)')

    const [
      { data: evData },
      { data: artData },
      { data: avData },
      { data: prodData },
      { data: assignData },
    ] = await Promise.all([
      evQ,
      supabase.from('artists').select('id,name,status').order('name'),
      supabase.from('availabilities').select('artist_id,type,start_time,end_time')
        .lte('start_time', `${end}T23:59:59`)
        .gte('end_time',   `${start}T00:00:00`),
      prodQ,
      assignQ,
    ])

    setAssignments(((assignData ?? []) as any[]).map(r => {
      const p = Array.isArray(r.productions) ? r.productions[0] : r.productions
      return { artist_id: r.artist_id, production_id: r.production_id, theatre_id: p?.theatre_id ?? null }
    }))

    setEvents((evData ?? []) as unknown as EventRow[])
    setArtists(sortByLastName((artData ?? []) as ArtistRow[]))
    setAvails(avData ?? [])
    setProductions(
      ((prodData ?? []) as unknown as { id: string; title: string; status: string | null; theatres: { name: string } | null }[])
        .map(p => ({
          id: p.id,
          title: p.title,
          status: p.status,
          theatreName: p.theatres?.name ?? null,
        }))
    )
    setLoading(false)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const rehearsals = events.filter(e => REHEARSAL_TYPES.has(e.type ?? ''))
    const shows      = events.filter(e => SHOW_TYPES.has(e.type ?? ''))
    const fittings   = events.filter(e => FITTING_TYPES.has(e.type ?? ''))
    const rehearsalH = rehearsals.reduce((s, e) => s + hours(e.start_time, e.end_time), 0)
    const conflictResults = findConflicts(events.map(e => ({
      id: e.id, start_time: e.start_time, end_time: e.end_time,
      room_id: e.room_id, theatre_id: e.theatre_id,
      artist_ids: e.event_artists.map(x => x.artist_id),
    })))
    const conflicts = conflictResults.length
    return { rehearsals: rehearsals.length, shows: shows.length, rehearsalH, conflicts, fittings: fittings.length }
  }, [events])

  const artistWorkload = useMemo(() => {
    const map: Record<string, { name: string; rehearsals: number; shows: number }> = {}
    for (const a of artists) map[a.id] = { name: shortName(a.name), rehearsals: 0, shows: 0 }
    for (const ev of events) {
      const isR = REHEARSAL_TYPES.has(ev.type ?? '')
      const isS = SHOW_TYPES.has(ev.type ?? '')
      if (!isR && !isS) continue
      for (const ea of ev.event_artists) {
        if (!map[ea.artist_id]) continue
        if (isR) map[ea.artist_id].rehearsals++
        if (isS) map[ea.artist_id].shows++
      }
    }
    return Object.values(map)
      .filter(r => r.rehearsals + r.shows > 0)
      .sort((a, b) => b.rehearsals + b.shows - a.rehearsals - a.shows)
      .slice(0, 12)
  }, [events, artists])

  const artistStatus = useMemo(() => {
    const onLeave = new Set(avails.filter(a => a.type === 'Urlop').map(a => a.artist_id))
    const onSick  = new Set(avails.filter(a => a.type === 'Choroba').map(a => a.artist_id))
    let available = 0, urlop = 0, niedostepni = 0
    for (const a of artists) {
      if (onSick.has(a.id)  || a.status === 'Choroba')    niedostepni++
      else if (onLeave.has(a.id) || a.status === 'Na urlopie') urlop++
      else available++
    }
    return [
      { name: td.availAvailable,   value: available,   fill: '#16a34a' },
      { name: td.statusVacation,   value: urlop,        fill: '#d97706' },
      { name: td.availUnavailable, value: niedostepni,  fill: '#dc2626' },
    ].filter(s => s.value > 0)
  }, [artists, avails])

  const perProduction = useMemo(() => {
    const map: Record<string, { title: string; count: number }> = {}
    for (const ev of events) {
      if (!REHEARSAL_TYPES.has(ev.type ?? '')) continue
      const key = ev.production_id ?? '__none__'
      if (!map[key]) map[key] = { title: ev.productions?.title ?? tr.colProduction, count: 0 }
      map[key].count++
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [events])

  const roomUtil = useMemo(() => {
    const map: Record<string, { name: string; hours: number }> = {}
    for (const ev of events) {
      if (!ev.room_id || !ev.rooms?.name) continue
      const key = ev.room_id
      if (!map[key]) map[key] = { name: ev.rooms.name, hours: 0 }
      map[key].hours += hours(ev.start_time, ev.end_time)
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [events])

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) {
      const t = ev.type ?? 'Inne'
      map[t] = (map[t] ?? 0) + 1
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [events])

  const theatreName = useMemo(() => {
    if (!selectedTheatreId) return tr.allTheatres
    return events.find(e => e.theatres?.name)?.theatres?.name ?? t.nav.theatreLabel
  }, [events, selectedTheatreId, tr, t.nav])

  const productionTable = useMemo(() => {
    const map: Record<string, {
      id: string; title: string; status: string | null; theatre: string
      rehearsals: number; shows: number; nextEvent: EventRow | null
    }> = {}

    // seed from productions list so we include all, even with 0 events in period
    for (const p of productions) {
      map[p.id] = { id: p.id, title: p.title, status: p.status, theatre: p.theatreName ?? '—', rehearsals: 0, shows: 0, nextEvent: null }
    }

    for (const ev of events) {
      const pid = ev.production_id
      if (!pid || !map[pid]) continue
      if (REHEARSAL_TYPES.has(ev.type ?? '')) map[pid].rehearsals++
      if (SHOW_TYPES.has(ev.type ?? ''))      map[pid].shows++
      if (ev.start_time >= `${today}T00:00:00`) {
        if (!map[pid].nextEvent || ev.start_time < map[pid].nextEvent!.start_time)
          map[pid].nextEvent = ev
      }
    }

    return Object.values(map)
      .filter(p => p.status !== 'Archiwalne') // exclude archived
      .sort((a, b) => (b.rehearsals + b.shows) - (a.rehearsals + a.shows))
  }, [events, productions, today])

  // Mapa produkcja → aktorzy (obsada produkcji), do liczenia obciążenia
  const prodToArtists = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const a of assignments) (m[a.production_id] ??= []).push(a.artist_id)
    return m
  }, [assignments])
  const currentTitles = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of assignments) {
      if (selectedTheatreId && a.theatre_id !== selectedTheatreId) continue
      c[a.artist_id] = (c[a.artist_id] ?? 0) + 1
    }
    return c
  }, [assignments, selectedTheatreId])

  // ── Obciążenie zespołu — dane wybranego miesiąca ──
  useEffect(() => {
    const [y, m] = wlMonth.split('-').map(Number)
    const mStart = `${wlMonth}-01`
    const mEnd   = localDate(new Date(y, m, 0))
    let eq = supabase.from('events')
      .select('id,type,start_time,end_time,production_id,theatre_id,event_artists(artist_id)')
      .gte('start_time', `${mStart}T00:00:00`).lte('start_time', `${mEnd}T23:59:59`)
    if (selectedTheatreId) eq = eq.eq('theatre_id', selectedTheatreId)
    const vq = supabase.from('availabilities').select('artist_id,start_time,end_time')
      .eq('type', 'Urlop')
      .lte('start_time', `${mEnd}T23:59:59`).gte('end_time', `${mStart}T00:00:00`)
    Promise.all([eq, vq]).then(([{ data: ev }, { data: va }]) => {
      setWlEvents((ev ?? []) as unknown as EventRow[])
      setWlVac((va ?? []) as any)
    })
  }, [wlMonth, selectedTheatreId])

  // Metryki per aktor dla wybranego miesiąca
  const workloadRows = useMemo(() => {
    const [y, m] = wlMonth.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const monStart = new Date(y, m - 1, 1).getTime()
    const monEnd   = new Date(y, m, 0).getTime() + 86_400_000
    type Row = { id: string; name: string; shows: number; rehHours: number; titles: Set<string>; worked: Set<string>; vac: number }
    const map: Record<string, Row> = {}
    for (const a of artists) map[a.id] = { id: a.id, name: a.name, shows: 0, rehHours: 0, titles: new Set(), worked: new Set(), vac: 0 }

    for (const ev of wlEvents) {
      const isS = SHOW_TYPES.has(ev.type ?? '')
      const isR = REHEARSAL_TYPES.has(ev.type ?? '')
      if (!isS && !isR) continue
      const day = String(ev.start_time).slice(0, 10)
      const h = hours(ev.start_time, ev.end_time)
      const explicit = ev.event_artists.map(e => e.artist_id)
      const cast = explicit.length > 0 ? explicit : (prodToArtists[(ev as any).production_id] ?? [])
      for (const aid of cast) {
        const r = map[aid]; if (!r) continue
        r.worked.add(day)
        if (isS) { r.shows++; if ((ev as any).production_id) r.titles.add((ev as any).production_id) }
        if (isR) r.rehHours += h
      }
    }
    for (const v of wlVac) {
      const r = map[v.artist_id]; if (!r) continue
      const s = Math.max(new Date(v.start_time).getTime(), monStart)
      const e = Math.min(new Date(v.end_time).getTime(), monEnd)
      r.vac += Math.max(0, Math.round((e - s) / 86_400_000))
    }
    const rows = Object.values(map).map(r => ({
      id: r.id, name: r.name, shows: r.shows, rehHours: Math.round(r.rehHours),
      titles: r.titles.size, vac: r.vac, freeDays: Math.max(0, daysInMonth - r.worked.size),
    }))
    // tylko aktorzy istotni: obecnie przypisani lub z aktywnością w miesiącu
    const relevant = rows.filter(r => (currentTitles[r.id] ?? 0) > 0 || r.shows > 0 || r.rehHours > 0 || r.titles > 0 || r.vac > 0)
    relevant.sort((a, b) => b.shows - a.shows || b.rehHours - a.rehHours || b.titles - a.titles || a.name.localeCompare(b.name, 'pl'))
    return relevant
  }, [artists, wlEvents, wlVac, prodToArtists, currentTitles, wlMonth])

  const absenceList = useMemo(() => {
    return avails
      .map(av => {
        const artist = artists.find(a => a.id === av.artist_id)
        if (!artist) return null
        const days = Math.max(1, Math.round((new Date(av.end_time).getTime() - new Date(av.start_time).getTime()) / 86400000))
        return { name: artist.name, type: av.type, start: av.start_time, end: av.end_time, days }
      })
      .filter(Boolean)
      .sort((a, b) => a!.start.localeCompare(b!.start)) as { name: string; type: string; start: string; end: string; days: number }[]
  }, [avails, artists])

  const generatedStr = new Date().toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' })

  const statCards = [
    { label: tr.statRehearsals, value: stats.rehearsals             },
    { label: tr.statShows,      value: stats.shows                  },
    { label: tr.statHours,      value: Math.round(stats.rehearsalH) },
    { label: tr.statConflicts,  value: stats.conflicts              },
    { label: tr.statFittings,   value: stats.fittings               },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 -mx-4 -mt-4 md:px-8 md:py-5 md:-mx-8 md:-mt-8 mb-2" style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{tr.pageTitle}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{theatreName} · {tr.generated} {generatedStr}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c8102e] text-gray-700"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors"
            style={{ background: '#c8102e' }}
            onMouseOver={e => (e.currentTarget.style.background = '#9e0c24')}
            onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-5-5 1.4-1.4 2.6 2.6V4h2v8.2l2.6-2.6L17 11l-5 5zm-7 4v-4h2v2h10v-2h2v4H5z"/>
            </svg>
            {tr.exportPdf}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        {loading
          ? [...Array(5)].map((_, i) => <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 h-28 animate-pulse" />)
          : statCards.map(s => {
              const isConflict = s.label === tr.statConflicts
              const hasConflicts = isConflict && (s.value as number) > 0
              return (
                <div key={s.label} className={`bg-white border rounded-2xl px-5 py-6 text-center ${hasConflicts ? 'border-red-200 bg-red-50/40' : ''}`} style={hasConflicts ? undefined : { borderColor: '#e4ddd4' }}>
                  <p className={`text-xs font-medium mb-3 leading-tight ${hasConflicts ? 'text-red-400' : ''}`} style={hasConflicts ? undefined : { color: '#7a7068' }}>{s.label}</p>
                  <p className={`text-4xl font-bold leading-none ${hasConflicts ? 'text-red-600' : ''}`} style={hasConflicts ? undefined : { color: '#1a1410' }}>{s.value}</p>
                </div>
              )
            })
        }
      </div>

      {/* Production table */}
      {!loading && productionTable.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{tr.productionsSection}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{tr.productionsCount(productionTable.length, !!selectedTheatreId)}</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colProduction}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colStatus}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colRehearsals}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colShows}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colNextEvent}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>{tr.colTheatre}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productionTable.map(p => {
                const statusColors: Record<string, string> = {
                  'Bieżące':    'bg-green-100 text-green-700',
                  'Planowane':  'bg-amber-100 text-amber-700',
                  'Archiwalne': 'bg-slate-100 text-slate-500',
                }
                const sc = statusColors[p.status ?? ''] ?? 'bg-gray-100 text-gray-500'
                const nextDate = p.nextEvent
                  ? new Date(p.nextEvent.start_time).toLocaleDateString(localeStr, { weekday: 'short', day: 'numeric', month: 'short' })
                  : null
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc}`}>{p.status ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-gray-800">{p.rehearsals}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-gray-800">{p.shows}</span>
                    </td>
                    <td className="px-4 py-3">
                      {nextDate
                        ? <span className="text-xs text-gray-600">{nextDate} · {p.nextEvent!.type ?? p.nextEvent!.title}</span>
                        : <span className="text-xs text-gray-500 italic">{tr.noNextEvent}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.theatre}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Charts row 1: workload + status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">

        {/* Artist workload */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#1a1410' }}>{tr.chartArtistWorkload}</h3>
          {loading || artistWorkload.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-500 italic">
              {loading ? tr.loading : tr.noDataPeriod}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, artistWorkload.length * 34)}>
              <BarChart data={artistWorkload} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={68} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                <Bar dataKey="rehearsals" name={tr.seriesRehearsals} fill={COLORS[0]} radius={[0,3,3,0]} barSize={8} />
                <Bar dataKey="shows"      name={tr.seriesShows}      fill={COLORS[1]} radius={[0,3,3,0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Artist status donut */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#1a1410' }}>{tr.chartArtistStatus}</h3>
          {loading || artistStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-500 italic">
              {loading ? tr.loading : tr.noData}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6 h-48">
              <PieChart width={148} height={148}>
                <Pie data={artistStatus} cx={70} cy={70} innerRadius={44} outerRadius={68}
                  dataKey="value" paddingAngle={3} stroke="none">
                  {artistStatus.map((s, i) => <Cell key={i} fill={s.fill} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
              <div className="space-y-4">
                {artistStatus.map(s => (
                  <div key={s.name} className="flex items-start gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ background: s.fill }} />
                    <div>
                      <p className="text-sm font-bold text-gray-900 leading-none">{s.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2: per-production + room util */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Rehearsals per production */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#1a1410' }}>{tr.chartRehearsalsPerProd}</h3>
          {loading || perProduction.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-xs text-gray-500 italic">
              {loading ? tr.loading : tr.noRehearsals}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perProduction} margin={{ left: 4, right: 4, top: 4, bottom: 44 }}>
                <XAxis dataKey="title" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                  angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="count" name={tr.seriesRehearsals} radius={[4,4,0,0]} barSize={36}>
                  {perProduction.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Room utilization */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#1a1410' }}>{tr.chartRoomUsage}</h3>
          {loading || roomUtil.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-xs text-gray-500 italic">
              {loading ? tr.loading : tr.noRooms}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={roomUtil} layout="vertical" margin={{ left: 0, right: 28, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={84} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="hours" name={tr.seriesHours} radius={[0,4,4,0]} barSize={20}>
                  {roomUtil.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Obciążenie zespołu — per wybrany miesiąc */}
      {!loading && (() => {
        const MONTHS_PL = td.months
        const [wy, wm] = wlMonth.split('-').map(Number)
        const nowY = new Date().getFullYear()
        const years = [nowY + 1, nowY, nowY - 1, nowY - 2]
        const setYM = (yy: number, mm: number) => setWlMonth(`${yy}-${String(mm).padStart(2, '0')}`)
        const selCls = 'rounded-lg px-3 py-1.5 text-sm bg-white'
        const selStyle = { border: '1px solid #e4ddd4', color: '#3e3830' }
        const cell = (v: number, suffix = '', muted = false) =>
          v > 0 ? <span className={`text-sm font-bold ${muted ? 'text-gray-600' : 'text-gray-800'}`}>{v}{suffix}</span> : <span className="text-sm text-gray-300">—</span>
        return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{tr.workloadSection}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Obciążenie aktorów w wybranym miesiącu</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={wm} onChange={e => setYM(wy, +e.target.value)} className={selCls} style={selStyle}>
                {MONTHS_PL.map((mn: string, idx: number) => <option key={idx} value={idx + 1}>{mn}</option>)}
              </select>
              <select value={wy} onChange={e => setYM(+e.target.value, wm)} className={selCls} style={selStyle}>
                {years.map(yy => <option key={yy} value={yy}>{yy}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">{tr.colRank}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tr.colArtist}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tytuły</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Spektakle</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Godz. prób</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dni wolne</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Urlop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {workloadRows.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">Brak danych dla wybranego miesiąca</td></tr>
              ) : workloadRows.map((a, i) => (
                <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3 text-xs text-gray-500 font-medium">{i + 1}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-gray-900 text-sm">{a.name}</p></td>
                  <td className="px-4 py-3 text-center">{cell(a.titles)}</td>
                  <td className="px-4 py-3 text-center">{cell(a.shows)}</td>
                  <td className="px-4 py-3 text-center">{cell(a.rehHours, 'h', true)}</td>
                  <td className="px-4 py-3 text-center"><span className="text-sm font-bold text-gray-600">{a.freeDays}</span></td>
                  <td className="px-4 py-3 text-center">
                    {a.vac > 0 ? <span className="text-sm font-bold text-amber-600">{a.vac}</span> : <span className="text-sm text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        )
      })()}

      {/* Absences */}
      {!loading && absenceList.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{tr.absencesSection}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{tr.absencesCount(absenceList.length)}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {absenceList.map((a, i) => {
              const isVacation = a.type === 'Urlop'
              const startFmt = new Date(a.start).toLocaleDateString(localeStr, { day: 'numeric', month: 'short' })
              const endFmt   = new Date(a.end).toLocaleDateString(localeStr,   { day: 'numeric', month: 'short', year: 'numeric' })
              return (
                <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50/50">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isVacation ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className="text-sm font-semibold text-gray-800 w-48 shrink-0">{a.name}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${isVacation ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>{a.type}</span>
                  <span className="text-xs text-gray-500">{startFmt} – {endFmt}</span>
                  <span className="ml-auto text-xs font-semibold text-gray-700">{tr.days(a.days)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Event type breakdown */}
      {!loading && typeCounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#1a1410' }}>{tr.eventTypesSection}</h3>
          <div className="flex flex-wrap gap-2.5">
            {typeCounts.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-xs font-medium text-gray-600">{t.name}</span>
                <span className="text-xs font-bold text-gray-900">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
