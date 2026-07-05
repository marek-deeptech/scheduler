'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ArtistModal from '@/components/ArtistModal'
import SubstitutesByTitle, { type ActorRef } from '@/components/SubstitutesByTitle'
import { IconMail, IconPhone, IconTheatre, IconSun, IconHeart } from '@/lib/icons'
import { useLanguage } from '@/lib/language-context'
import { sortByLastName } from '@/lib/names'
import { SHOW_TYPES } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArtistRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  actor_type: string | null
  avatar_url: string | null
  productionCount: number
  playedHours: number      // zagrane godziny w ost. 12 mies. (przeszłe spektakle)
  playCount: number        // liczba zagranych spektakli w ost. 12 mies.
  dublerCount: number      // liczba zagranych dublur (zastępstw) w ost. 12 mies.
  is_core: boolean
}

interface ProductionRef {
  id: string
  title: string
  theatreName: string | null
  status: string | null
}

interface EventRef {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  room: string | null
  productionTitle: string | null
}

interface AvailRef {
  id: string
  type: string
  start_time: string
  end_time: string
  note: string | null
}

interface SubstituteRef {
  id: string
  name: string
  avatar_url: string | null
  status: string | null
}

interface ConfirmationRef {
  id: string
  status: string
  sent_at: string
  responded_at: string | null
  comment: string | null
  event: {
    id: string
    title: string
    type: string | null
    start_time: string
    end_time: string
    productionTitle: string | null
  } | null
}

interface MessageRef {
  id: string
  type: 'email' | 'sms'
  subject: string | null
  body: string
  sent_at: string
}

interface ArtistDetail {
  productions: ProductionRef[]
  upcomingEvents: EventRef[]
  pastEvents: EventRef[]
  vacations: AvailRef[]
  sicknesses: AvailRef[]
  substitutes: SubstituteRef[]
  confirmations: ConfirmationRef[]
  messages: MessageRef[]
}

interface ProductionForModal { id: string; title: string; theatres?: { name: string } | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  'Dostępny':                   { badge: 'bg-green-600 text-white',        dot: 'bg-green-500'   },
  'Dostępny tylko w Warszawie': { badge: 'bg-emerald-900 text-white',      dot: 'bg-emerald-700' },
  'Niepewny':                   { badge: 'bg-orange-500 text-white',       dot: 'bg-orange-400'  },
  'Niedostępny':                { badge: 'bg-red-600 text-white',          dot: 'bg-red-500'     },
  'Urlop':                      { badge: 'bg-amber-400 text-black',        dot: 'bg-amber-400'   },
  'Choroba':                    { badge: 'bg-gray-900 text-white',         dot: 'bg-gray-700'    },
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, size = 'sm' }: { status: string | null; size?: 'sm' | 'md' }) {
  // 'active' to redundantna pozostałość — traktujemy jak Dostępny
  const s = (!status || status === 'active') ? 'Dostępny' : status
  const style = STATUS_STYLE[s] ?? STATUS_STYLE['Dostępny']
  const cls = size === 'md'
    ? `text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.badge}`
    : `text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      {s === 'Urlop' && <IconSun size={size === 'md' ? 11 : 10} />}
      {s}
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
function fmtTime(iso: string) {
  return String(iso).slice(11, 16)  // ściana zegara (UTC) = czas Warszawa; bez przesunięcia strefy
}
function fmtDayShort(iso: string, localeStr: string) {
  return new Date(iso).toLocaleDateString(localeStr, { weekday: 'short', day: 'numeric', month: 'short' })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: '#e8e0d6', color: '#5a524a' }}>
      {initials(name)}
    </div>
  )
}

// ─── Artist card ──────────────────────────────────────────────────────────────

function ArtistCard({ artist, isSelected, onClick }: {
  artist: ArtistRow
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all relative overflow-hidden"
      style={{
        background: isSelected ? '#fff' : '#fff',
        border: isSelected ? '1px solid #c8102e' : '1px solid #e4ddd4',
        boxShadow: isSelected ? '0 0 0 1px #c8102e' : '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {/* Crimson left accent when selected */}
      {isSelected && (
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: '#c8102e' }} />
      )}
      <Avatar url={artist.avatar_url} name={artist.name} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate flex items-center gap-1" style={{ color: '#1a1410' }}>
          {artist.is_core && <span title="Aktor CORE" className="shrink-0" style={{ color: '#c8102e' }}>★</span>}
          <span className="truncate">{artist.name}</span>
        </p>
        <p className="text-xs truncate" style={{ color: '#a89e92' }}>{artist.role ?? '—'}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={artist.status} size="sm" />
        {artist.actor_type && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{ background: '#f2ede6', color: '#7a7068' }}>
            {artist.actor_type}
          </span>
        )}
        {artist.productionCount > 0 && (
          <span className="text-[10px]" style={{ color: '#a89e92' }}>{artist.productionCount} {artist.productionCount === 1 ? 'tytuł' : artist.productionCount < 5 ? 'tytuły' : 'tytułów'}</span>
        )}
        {artist.playCount > 0 && (
          <span className="text-[10px] font-semibold" style={{ color: '#7a2020' }}>{artist.playCount} {artist.playCount === 1 ? 'spektakl' : artist.playCount < 5 ? 'spektakle' : 'spektakli'}/rok</span>
        )}
      </div>
    </div>
  )
}

// ─── Week-view helpers ────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  const mon = new Date(d)
  mon.setHours(0, 0, 0, 0)
  mon.setDate(d.getDate() - day)
  return mon
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n * 7)
  return r
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function eventTypePill(type: string | null): string {
  if (!type) return 'bg-[#f2ede6] text-[#7a7068] border-l-[#cec5b8]'
  if (type.startsWith('Próba'))  return 'bg-[#f2ede6] text-[#5a524a] border-l-[#cec5b8]'
  if (type === 'Spektakl' || type === 'Premiera' || type === 'Spektakl gościnny')
    return 'bg-[#fdf0f2] text-[#9e0c24] border-l-[#c8102e]'
  if (type === 'Przymiarki kostiumowe') return 'bg-green-50 text-green-700 border-l-green-400'
  return 'bg-[#f2ede6] text-[#7a7068] border-l-[#cec5b8]'
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2.5" style={{ color: '#b8b0a4' }}>
      {children}
    </p>
  )
}

// ─── Artist week view ─────────────────────────────────────────────────────────

function ArtistWeekView({ artistId, localeStr, ta }: {
  artistId: string
  localeStr: string
  ta: ReturnType<typeof useLanguage>['t']['artists']
}) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [events,    setEvents]    = useState<EventRef[]>([])
  const [avails,    setAvails]    = useState<AvailRef[]>([])
  const [loading,   setLoading]   = useState(true)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)

  const todayStr = toDateStr(new Date())

  const fetch = useCallback(async (id: string) => {
    setLoading(true)
    const rangeStart = toDateStr(addWeeks(getMonday(new Date()), -4))
    const rangeEnd   = toDateStr(addWeeks(getMonday(new Date()), +12))

    // Wydarzenia z jawnej obsady (event_artists) + spektakle z produkcji aktora (artist_productions)
    const [{ data: eaData }, { data: apData }] = await Promise.all([
      supabase.from('event_artists').select('event_id').eq('artist_id', id),
      supabase.from('artist_productions').select('production_id').eq('artist_id', id),
    ])
    const eventIds = [...new Set(((eaData ?? []) as any[]).map(r => r.event_id))]
    const prodIds  = [...new Set(((apData ?? []) as any[]).map(r => r.production_id))]

    const evSelect = 'id, title, type, start_time, end_time, rooms(name), productions(title)'
    const inRange = (q: any) => q.gte('start_time', `${rangeStart}T00:00:00`).lte('start_time', `${rangeEnd}T23:59:59`)

    const [byEvent, byProd, avData] = await Promise.all([
      eventIds.length > 0 ? inRange(supabase.from('events').select(evSelect).in('id', eventIds)) : Promise.resolve({ data: [] }),
      prodIds.length  > 0 ? inRange(supabase.from('events').select(evSelect).in('production_id', prodIds)) : Promise.resolve({ data: [] }),
      supabase.from('availabilities')
        .select('id, type, start_time, end_time, note')
        .eq('artist_id', id)
        .in('type', ['Urlop', 'Niedostępny'])
        .order('start_time'),
    ])

    // Scal i odduplikuj po id
    const evMap = new Map<string, any>()
    for (const e of [...((byEvent.data ?? []) as any[]), ...((byProd.data ?? []) as any[])]) evMap.set(e.id, e)
    const mergedEvents = [...evMap.values()].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))

    setEvents(mergedEvents.map(e => {
      const rm   = Array.isArray(e.rooms)       ? e.rooms[0]       : e.rooms
      const prod = Array.isArray(e.productions)  ? e.productions[0] : e.productions
      return { id: e.id, title: e.title, type: e.type, start_time: e.start_time,
               end_time: e.end_time, room: rm?.name ?? null, productionTitle: prod?.title ?? null }
    }))
    setAvails((avData.data ?? []) as AvailRef[])
    setFetchedFor(id)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (artistId !== fetchedFor) fetch(artistId)
  }, [artistId, fetchedFor, fetch])

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const weekLabel = (() => {
    const s = weekStart
    const e = weekDays[6]
    const sm = s.toLocaleDateString(localeStr, { day: 'numeric', month: 'short' })
    const em = e.toLocaleDateString(localeStr, { day: 'numeric', month: 'short', year: 'numeric' })
    return `${sm} – ${em}`
  })()

  function isInAvail(av: AvailRef, dateStr: string): boolean {
    return av.start_time.slice(0,10) <= dateStr && av.end_time.slice(0,10) >= dateStr
  }

  function openInCalendar(dateStr: string) {
    router.push(`/calendar?date=${dateStr}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Week navigation */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setWeekStart(w => addWeeks(w, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-sm"
            style={{ color: '#7a7068' }}
            onMouseOver={e => (e.currentTarget.style.background = '#f2ede6')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            title={ta.prevWeek}
          >‹</button>
          <span className="text-xs font-semibold text-center flex-1" style={{ color: '#3e3830' }}>{weekLabel}</span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-sm"
            style={{ color: '#7a7068' }}
            onMouseOver={e => (e.currentTarget.style.background = '#f2ede6')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            title={ta.nextWeek}
          >›</button>
        </div>
        {toDateStr(weekStart) !== toDateStr(getMonday(new Date())) && (
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="mt-1.5 w-full text-[10px] transition-colors"
            style={{ color: '#a89e92' }}
          >{ta.todayBtn}</button>
        )}
      </div>

      {/* Day list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#a89e92' }}>{ta.loading}</div>
      ) : (
        <div className="flex-1 overflow-y-auto" style={{ background: '#faf8f5' }}>
          {weekDays.map(day => {
            const dateStr = toDateStr(day)
            const isToday = dateStr === todayStr
            const dayEvents = events.filter(e => e.start_time.slice(0,10) === dateStr)
            const onVacation = avails.some(av => av.type === 'Urlop'   && isInAvail(av, dateStr))
            const onSick     = avails.some(av => av.type === 'Niedostępny' && isInAvail(av, dateStr))
            const dow = day.getDay()
            const isWeekend = dow === 0 || dow === 6

            const rowBg = onSick ? '#fef2f2' : onVacation ? '#fffbeb' : isWeekend ? '#f7f3ee' : '#faf8f5'

            return (
              <div key={dateStr} className="px-4 py-2.5" style={{ background: rowBg, borderBottom: '1px solid #ede8e0' }}>
                {/* Day header */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase w-7" style={{ color: isWeekend ? '#7a7068' : '#a89e92' }}>
                      {day.toLocaleDateString(localeStr, { weekday: 'short' })}
                    </span>
                    <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full`}
                      style={isToday
                        ? { background: '#c8102e', color: '#fff' }
                        : { color: '#3e3830' }}>
                      {day.getDate()}
                    </span>
                  </div>

                  {onSick && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-red-500 ml-1">
                      <IconHeart size={10} /> {ta.sick}
                    </span>
                  )}
                  {onVacation && !onSick && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 ml-1">
                      <IconSun size={10} /> {ta.vacation}
                    </span>
                  )}

                  {dayEvents.length > 0 && (
                    <button
                      onClick={() => openInCalendar(dateStr)}
                      className="ml-auto text-[10px] transition-colors"
                      style={{ color: '#a89e92' }}
                      title={ta.openInCalendar}
                    >↗</button>
                  )}
                </div>

                {/* Events */}
                {dayEvents.length === 0 && !onVacation && !onSick ? (
                  <p className="text-[10px] pl-8" style={{ color: '#cec5b8' }}>{ta.noEventsDay}</p>
                ) : (
                  <div className="flex flex-col gap-1 pl-8">
                    {dayEvents.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => openInCalendar(dateStr)}
                        className={`w-full text-left rounded-lg border-l-2 px-2 py-1 hover:opacity-80 transition-opacity ${eventTypePill(ev.type)}`}
                      >
                        <p className="text-[11px] font-semibold leading-tight truncate">
                          {ev.type ?? ev.title}
                        </p>
                        <p className="text-[10px] opacity-70 leading-tight">
                          {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                          {ev.room ? ` · ${ev.room}` : ''}
                        </p>
                        {ev.productionTitle && (
                          <p className="text-[10px] opacity-60 truncate leading-tight">{ev.productionTitle}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Messages tab ─────────────────────────────────────────────────────────────

function MessagesTab({ artist, detail, onDetailRefresh }: {
  artist: ArtistRow
  detail: ArtistDetail
  onDetailRefresh: () => void
}) {
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)
  const [composing,     setComposing]     = useState(false)
  const [composeType,   setComposeType]   = useState<'email' | 'sms'>('email')
  const [subject,       setSubject]       = useState('')
  const [body,          setBody]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [sent,          setSent]          = useState(false)
  const [confirmingId,  setConfirmingId]  = useState<string | null>(null)

  // NOTE: no refresh-on-mount here — detail is fetched when the artist is
  // selected, and a mount-effect combined with the loading state used to
  // unmount/remount this tab in an endless flicker loop.

  const confirmations = detail.confirmations ?? []
  const messages      = detail.messages      ?? []
  const pending  = confirmations.filter(c => c.status === 'pending')
  const history  = confirmations.filter(c => c.status !== 'pending')

  const CONF_STYLE: Record<string, string> = {
    confirmed: 'bg-green-600 text-white',
    declined:  'bg-red-600 text-white',
    maybe:     'bg-orange-500 text-white',
    pending:   'bg-[#f2ede6] text-[#7a7068]',
  }
  const CONF_LABEL: Record<string, string> = {
    confirmed: 'BĘDĘ',
    declined:  'NIE BĘDĘ',
    maybe:     'BYĆ MOŻE',
    pending:   'Oczekuje',
  }

  function fmtSent(iso: string) {
    return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  function fmtEvent(c: ConfirmationRef) {
    if (!c.event) return '—'
    const d = new Date(c.event.start_time)
    const day = d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
    const time = String(c.event.start_time).slice(11, 16)  // ściana zegara (UTC) = czas Warszawa
    return `${c.event.productionTitle ?? c.event.type ?? c.event.title} · ${day}, ${time}`
  }

  async function updateConfirmation(confId: string, status: string) {
    setConfirmingId(confId)
    await supabase.from('event_confirmations').update({ status, responded_at: new Date().toISOString() }).eq('id', confId)
    setConfirmingId(null)
    onDetailRefresh()
  }

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: artist.id, subject: subject || '(bez tematu)', body }),
    })
    setSending(false)
    setSent(true)
    setBody('')
    setSubject('')
    setTimeout(() => { setSent(false); setComposing(false); onDetailRefresh() }, 2000)
  }

  const inputCls = 'w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e] bg-white'

  return (
    <div className="flex flex-col gap-5 px-5 py-4">

      {/* ── Pending confirmations ─────────────────────────────────── */}
      <div>
        <SectionLabel>
          Potwierdzenia oczekujące{pending.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px]"
              style={{ background: '#fde68a', color: '#92400e' }}>{pending.length}</span>
          )}
        </SectionLabel>
        {pending.length === 0 ? (
          <p className="text-xs italic" style={{ color: '#a89e92' }}>Brak oczekujących potwierdzeń</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map(c => (
              <div key={c.id} className="rounded-xl px-3 py-2.5"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <p className="text-xs font-semibold truncate" style={{ color: '#1a1410' }}>{fmtEvent(c)}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#a89e92' }}>Wysłano: {fmtSent(c.sent_at)}</p>
                <div className="flex gap-1.5 mt-2">
                  <button disabled={confirmingId === c.id} onClick={() => updateConfirmation(c.id, 'confirmed')}
                    className="flex-1 py-1 text-[11px] font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">BĘDĘ</button>
                  <button disabled={confirmingId === c.id} onClick={() => updateConfirmation(c.id, 'maybe')}
                    className="flex-1 py-1 text-[11px] font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">BYĆ MOŻE</button>
                  <button disabled={confirmingId === c.id} onClick={() => updateConfirmation(c.id, 'declined')}
                    className="flex-1 py-1 text-[11px] font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">NIE BĘDĘ</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirmation history ──────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <SectionLabel>Historia potwierdzeń</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {history.map(c => (
              <div key={c.id} className="flex items-start gap-2 rounded-xl px-3 py-2"
                style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${CONF_STYLE[c.status] ?? 'bg-[#f2ede6] text-[#7a7068]'}`}>
                  {CONF_LABEL[c.status] ?? c.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" style={{ color: '#1a1410' }}>{fmtEvent(c)}</p>
                  {c.comment && <p className="text-[10px] mt-0.5 italic" style={{ color: '#7a7068' }}>„{c.comment}"</p>}
                  <p className="text-[10px] mt-0.5" style={{ color: '#a89e92' }}>
                    {c.responded_at ? `Odpowiedź: ${fmtSent(c.responded_at)}` : `Wysłano: ${fmtSent(c.sent_at)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Message history ───────────────────────────────────────── */}
      <div>
        <SectionLabel>Historia wiadomości</SectionLabel>
        {messages.length === 0 ? (
          <p className="text-xs italic" style={{ color: '#a89e92' }}>Brak wysłanych wiadomości</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map(m => (
              <div key={m.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #e4ddd4', background: '#fff' }}>
                <button
                  onClick={() => setExpandedMsgId(expandedMsgId === m.id ? null : m.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                  style={{ background: expandedMsgId === m.id ? '#faf8f5' : '#fff' }}
                >
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={m.type === 'email'
                      ? { background: '#e8e0d6', color: '#5a524a' }
                      : { background: '#dcfce7', color: '#166534' }}>
                    {m.type === 'email' ? 'Email' : 'SMS'}
                  </span>
                  <span className="flex-1 text-xs font-medium truncate" style={{ color: '#1a1410' }}>
                    {m.subject ?? m.body.slice(0, 40)}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: '#a89e92' }}>{fmtSent(m.sent_at)}</span>
                  <span className="text-xs" style={{ color: '#cec5b8' }}>{expandedMsgId === m.id ? '▲' : '▼'}</span>
                </button>
                {expandedMsgId === m.id && (
                  <div className="px-3 pb-3" style={{ borderTop: '1px solid #f2ede6' }}>
                    {m.subject && <p className="text-[10px] font-semibold mt-2 mb-1" style={{ color: '#7a7068' }}>Temat: {m.subject}</p>}
                    <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#3e3830' }}>{m.body}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Compose ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Nowa wiadomość</SectionLabel>
          {!composing && (
            <button
              onClick={() => setComposing(true)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: '#f2ede6', color: '#5a524a', border: '1px solid #e4ddd4' }}
            >
              + Napisz
            </button>
          )}
        </div>
        {composing && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e4ddd4' }}>
            <div className="flex" style={{ borderBottom: '1px solid #e4ddd4' }}>
              {(['email', 'sms'] as const).map(t => (
                <button key={t} onClick={() => setComposeType(t)}
                  className="flex-1 py-2 text-xs font-semibold transition-colors"
                  style={composeType === t
                    ? { background: '#1a1410', color: '#fff' }
                    : { background: '#faf8f5', color: '#7a7068' }}>
                  {t === 'email' ? '📧 Email' : '📱 SMS'}
                </button>
              ))}
            </div>
            <div className="p-3 space-y-2" style={{ background: '#fff' }}>
              {composeType === 'email' && (
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Temat…"
                  className={inputCls}
                  style={{ border: '1px solid #e4ddd4' }} />
              )}
              <textarea
                rows={composeType === 'sms' ? 3 : 5}
                value={body}
                onChange={e => setBody(composeType === 'sms' ? e.target.value.slice(0, 160) : e.target.value)}
                placeholder={composeType === 'sms' ? `Treść SMS (${body.length}/160)…` : 'Treść wiadomości…'}
                className={`${inputCls} resize-none`}
                style={{ border: '1px solid #e4ddd4' }} />
              {sent ? (
                <p className="text-xs text-green-600 font-semibold text-center py-1">✓ Wysłano</p>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setComposing(false); setBody(''); setSubject('') }}
                    className="flex-1 py-2 text-xs font-medium rounded-xl transition-colors"
                    style={{ background: '#faf8f5', color: '#7a7068', border: '1px solid #e4ddd4' }}>
                    Anuluj
                  </button>
                  <button onClick={handleSend}
                    disabled={sending || !body.trim() || (composeType === 'email' && !artist.email)}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors"
                    style={{ background: '#1a1410', color: '#fff' }}>
                    {sending ? 'Wysyłanie…' : 'Wyślij'}
                  </button>
                </div>
              )}
              {composeType === 'email' && !artist.email && (
                <p className="text-[10px] text-red-500">Brak adresu email aktora</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ProfilePanel({ artist, detail, loading, onEdit, onClose, onDetailRefresh, allActors, initialTab }: {
  artist: ArtistRow
  detail: ArtistDetail | null
  loading: boolean
  onEdit: () => void
  onClose: () => void
  onDetailRefresh: () => void
  allActors: ActorRef[]
  initialTab?: 'profile' | 'plan' | 'messages' | 'subs'
}) {
  const { t, locale } = useLanguage()
  const ta = t.artists
  const localeStr = locale === 'pl' ? 'pl-PL' : 'en-US'
  const now = new Date()

  const [activeTab,    setActiveTab]    = useState<'profile' | 'plan' | 'messages' | 'subs'>(initialTab ?? 'profile')
  const [emailOpen,    setEmailOpen]    = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody,    setEmailBody]    = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent,    setEmailSent]    = useState(false)
  const [smsOpen,      setSmsOpen]      = useState(false)
  const [smsBody,      setSmsBody]      = useState('')
  const [smsSending,   setSmsSending]   = useState(false)
  const [smsSent,      setSmsSent]      = useState(false)

  async function handleSendEmail() {
    if (!emailSubject || !emailBody) return
    setEmailSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: artist.id, subject: emailSubject, body: emailBody }),
    })
    setEmailSending(false)
    setEmailSent(true)
    setEmailSubject('')
    setEmailBody('')
    setTimeout(() => { setEmailSent(false); setEmailOpen(false) }, 3000)
  }

  async function handleSendSms() {
    if (!smsBody.trim()) return
    setSmsSending(true)
    await fetch('/api/notify/individual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: artist.id, subject: '', body: smsBody, channel: 'sms' }),
    })
    setSmsSending(false)
    setSmsSent(true)
    setSmsBody('')
    setTimeout(() => { setSmsSent(false); setSmsOpen(false) }, 3000)
  }

  const firstTabRun = useRef(true)
  useEffect(() => {
    if (firstTabRun.current) { firstTabRun.current = false; return }
    setActiveTab('profile')
  }, [artist.id])

  const inputCls = 'w-full rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#c8102e]'

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="px-5 py-5 shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-start justify-between mb-4">
          <Avatar url={artist.avatar_url} name={artist.name} size="lg" />
          <button onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-2xl leading-none transition-colors"
            style={{ color: '#a89e92' }}
            onMouseOver={e => { e.currentTarget.style.background = '#f2ede6'; e.currentTarget.style.color = '#1a1410' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a89e92' }}>
            ×
          </button>
        </div>

        <h3 className="font-bold" style={{ color: '#1a1410', fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.05rem' }}>
          {artist.name}
        </h3>
        {artist.role && <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{artist.role}</p>}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <StatusBadge status={artist.status} size="md" />
          {artist.actor_type && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize"
              style={{ background: '#f2ede6', color: '#7a7068' }}>
              {artist.actor_type}
            </span>
          )}
        </div>

        {/* Contact info */}
        <div className="mt-3 space-y-1">
          {artist.email && (
            // TRYB TESTOWY: link „mailto" celuje w adresy testowe, by nie pisać do prawdziwych osób.
            <a href="mailto:Marek@veryniceworks.com,k.szustow@szustow.com"
              className="flex items-center gap-2 text-xs transition-colors group"
              style={{ color: '#7a7068' }}>
              <IconMail size={12} />
              {artist.email}
            </a>
          )}
          {artist.phone && (
            // TRYB TESTOWY: link „tel" celuje w numer testowy, by nie dzwonić do prawdziwych osób.
            <a href="tel:60849442"
              className="flex items-center gap-2 text-xs transition-colors group"
              style={{ color: '#7a7068' }}>
              <IconPhone size={12} />
              {artist.phone}
            </a>
          )}
        </div>

        {/* Podsumowanie — statystyki */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl px-3 py-2" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#a89e92' }}>Tytuły</p>
            <p className="text-lg font-bold leading-tight" style={{ color: '#1a1410' }}>{artist.productionCount}</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#a89e92' }}>Zagrane godz. (12 mies.)</p>
            <p className="text-lg font-bold leading-tight" style={{ color: '#1a1410' }}>{artist.playedHours}</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#a89e92' }}>Zagrane spektakle (12 mies.)</p>
            <p className="text-lg font-bold leading-tight" style={{ color: '#1a1410' }}>{artist.playCount}</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#a89e92' }}>Zagrane dublury (12 mies.)</p>
            <p className="text-lg font-bold leading-tight" style={{ color: artist.dublerCount > 0 ? '#6d28d9' : '#1a1410' }}>{artist.dublerCount}</p>
          </div>
        </div>

        {/* Contact action buttons */}
        {(artist.email || artist.phone) && (
          <div className="flex gap-2 mt-3">
            {artist.email && (
              <button
                onClick={() => { setEmailOpen(v => !v); setSmsOpen(false) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
                style={emailOpen
                  ? { background: '#1a1410', color: '#fff', border: '1px solid #1a1410' }
                  : { background: '#faf8f5', color: '#5a524a', border: '1px solid #e4ddd4' }}>
                <IconMail size={11} /> Email
              </button>
            )}
            {artist.phone && (
              <button
                onClick={() => { setSmsOpen(v => !v); setEmailOpen(false) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-colors"
                style={smsOpen
                  ? { background: '#1a1410', color: '#fff', border: '1px solid #1a1410' }
                  : { background: '#faf8f5', color: '#5a524a', border: '1px solid #e4ddd4' }}>
                <IconPhone size={11} /> SMS
              </button>
            )}
          </div>
        )}

        {/* Email compose */}
        {emailOpen && (
          <div className="mt-2 space-y-2 rounded-xl p-3" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <input placeholder={ta.emailSubjectPlaceholder} value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              className={inputCls} style={{ border: '1px solid #e4ddd4' }} />
            <textarea placeholder={ta.emailBodyPlaceholder} value={emailBody}
              onChange={e => setEmailBody(e.target.value)} rows={4}
              className={`${inputCls} resize-none`} style={{ border: '1px solid #e4ddd4' }} />
            <div className="flex items-center justify-between">
              <button onClick={() => { setEmailOpen(false); setEmailSubject(''); setEmailBody('') }}
                className="text-xs" style={{ color: '#a89e92' }}>{ta.cancel}</button>
              <button onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-opacity"
                style={{ background: '#1a1410', color: '#fff' }}>
                {emailSending ? ta.sending : ta.sendEmail}
              </button>
            </div>
            {emailSent && <p className="text-xs text-green-600 font-medium">{ta.sent}</p>}
          </div>
        )}

        {/* SMS compose */}
        {smsOpen && (
          <div className="mt-2 space-y-2 rounded-xl p-3" style={{ background: '#faf8f5', border: '1px solid #e4ddd4' }}>
            <p className="text-[10px] font-medium" style={{ color: '#7a7068' }}>
              {ta.smsTo}<span style={{ color: '#3e3830' }}>{artist.phone}</span>
            </p>
            <textarea placeholder={ta.smsBodyPlaceholder} value={smsBody}
              onChange={e => setSmsBody(e.target.value.slice(0, 160))} rows={3}
              className={`${inputCls} resize-none`} style={{ border: '1px solid #e4ddd4' }} />
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: '#a89e92' }}>{smsBody.length}/160</span>
              <div className="flex gap-2">
                <button onClick={() => { setSmsOpen(false); setSmsBody('') }}
                  className="text-xs" style={{ color: '#a89e92' }}>{ta.cancel}</button>
                <button onClick={handleSendSms}
                  disabled={smsSending || !smsBody.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-opacity"
                  style={{ background: '#1a1410', color: '#fff' }}>
                  {smsSending ? ta.sending : 'Wyślij SMS'}
                </button>
              </div>
            </div>
            {smsSent && <p className="text-xs text-green-600 font-medium">{ta.sent}</p>}
          </div>
        )}

        <button onClick={onEdit}
          className="mt-3 w-full py-2 text-xs font-medium rounded-xl transition-colors"
          style={{ background: '#faf8f5', color: '#5a524a', border: '1px solid #e4ddd4' }}>
          {ta.editProfile}
        </button>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-3 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
          {(['profile', 'plan', 'subs', 'messages'] as const).map(tab => {
            const pendingCount = tab === 'messages' && detail
              ? (detail.confirmations ?? []).filter(c => c.status === 'pending').length
              : 0
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-[10px] transition-all relative"
                style={activeTab === tab
                  ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  : { color: '#7a7068' }}>
                {tab === 'profile' ? ta.profileTab : tab === 'plan' ? ta.planTab : tab === 'subs' ? 'Dublerzy' : 'Wiad.'}
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Plan tab */}
      {activeTab === 'plan' && (
        <div className="flex-1 overflow-hidden">
          <ArtistWeekView artistId={artist.id} localeStr={localeStr} ta={ta} />
        </div>
      )}

      {/* Dublerzy tab — per tytuł */}
      {activeTab === 'subs' && (
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: '#faf8f5' }}>
          <p className="text-[11px] mb-3" style={{ color: '#a89e92' }}>
            Dla każdego tytułu wskaż osobnych dublerów. Przy konflikcie obsady proponowani są tylko dublerzy z danego tytułu.
          </p>
          {!detail && loading ? (
            <div className="flex items-center justify-center py-8 text-xs" style={{ color: '#a89e92' }}>{ta.loading}</div>
          ) : (
            <SubstitutesByTitle
              actorId={artist.id}
              productions={(detail?.productions ?? []).map(p => ({ id: p.id, title: p.title, theatreName: p.theatreName }))}
              allActors={allActors}
              editable
              onChange={onDetailRefresh}
            />
          )}
        </div>
      )}

      {/* Messages tab — keep content mounted during refresh (loader only on first load),
          otherwise MessagesTab's mount-effect re-triggers fetchDetail in a loop */}
      {activeTab === 'messages' && detail ? (
        <div className="flex-1 overflow-y-auto" style={{ background: '#faf8f5' }}>
          <MessagesTab artist={artist} detail={detail} onDetailRefresh={onDetailRefresh} />
        </div>
      ) : activeTab === 'messages' ? (
        <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#a89e92' }}>{ta.loading}</div>
      ) : null}

      {/* Profile tab */}
      {activeTab === 'profile' && !detail && loading ? (
        <div className="flex-1 flex items-center justify-center text-xs" style={{ color: '#a89e92' }}>{ta.loading}</div>
      ) : activeTab === 'profile' && detail ? (
        <div className="flex-1 overflow-y-auto" style={{ background: '#faf8f5' }}>

          {/* Productions */}
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #ede8e0' }}>
            <SectionLabel>{ta.productions(detail.productions.length)}</SectionLabel>
            {detail.productions.length === 0 ? (
              <p className="text-xs italic" style={{ color: '#a89e92' }}>{ta.noProductions}</p>
            ) : (
              <div className="space-y-1.5">
                {detail.productions.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl"
                    style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: '#1a1410' }}>{p.title}</p>
                      {p.theatreName && <p className="text-[10px]" style={{ color: '#a89e92' }}>{p.theatreName}</p>}
                    </div>
                    {p.status && (
                      <span className="text-[10px] shrink-0 ml-2" style={{ color: '#a89e92' }}>{p.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming events */}
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #ede8e0' }}>
            <SectionLabel>{ta.upcoming(detail.upcomingEvents.length)}</SectionLabel>
            {detail.upcomingEvents.length === 0 ? (
              <p className="text-xs italic" style={{ color: '#a89e92' }}>{ta.noUpcoming}</p>
            ) : (
              <div className="space-y-1.5">
                {detail.upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2.5 py-2 px-2.5 rounded-xl"
                    style={{ background: '#fff', border: '1px solid #e4ddd4' }}>
                    <div className="shrink-0 text-center w-8 mt-0.5">
                      <p className="text-[10px] leading-none" style={{ color: '#a89e92' }}>
                        {new Date(ev.start_time).toLocaleDateString(localeStr, { weekday: 'short' })}
                      </p>
                      <p className="text-sm font-bold leading-tight" style={{ color: '#1a1410' }}>
                        {new Date(ev.start_time).getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: '#1a1410' }}>{ev.type ?? ev.title}</p>
                      <p className="text-[10px]" style={{ color: '#7a7068' }}>
                        {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                        {ev.room ? ` · ${ev.room}` : ''}
                      </p>
                      {ev.productionTitle && (
                        <div className="flex items-center gap-1 text-[10px] truncate" style={{ color: '#a89e92' }}>
                          <IconTheatre size={10} className="shrink-0" /><span>{ev.productionTitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Availability */}
          {(detail.vacations.length > 0 || detail.sicknesses.length > 0) && (
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #ede8e0' }}>
              <SectionLabel>{ta.availability}</SectionLabel>
              <div className="space-y-1.5">
                {detail.vacations.map(v => {
                  const isActive = v.start_time <= now.toISOString() && v.end_time >= now.toISOString()
                  return (
                    <div key={v.id} className="flex items-start gap-2 py-1.5 px-2.5 rounded-xl"
                      style={isActive
                        ? { background: '#fffbeb', border: '1px solid #fde68a' }
                        : { background: '#fff', border: '1px solid #e4ddd4' }}>
                      <span className="shrink-0 mt-0.5" style={{ color: '#a89e92' }}><IconSun size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: '#3e3830' }}>
                          {fmtDate(v.start_time)} – {fmtDate(v.end_time)}
                        </p>
                        {v.note && <p className="text-[10px]" style={{ color: '#7a7068' }}>{v.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-amber-600 shrink-0 ml-auto">{ta.active}</span>}
                    </div>
                  )
                })}
                {detail.sicknesses.map(s => {
                  const isActive = s.start_time <= now.toISOString() && s.end_time >= now.toISOString()
                  return (
                    <div key={s.id} className="flex items-start gap-2 py-1.5 px-2.5 rounded-xl"
                      style={isActive
                        ? { background: '#fef2f2', border: '1px solid #fecaca' }
                        : { background: '#fff', border: '1px solid #e4ddd4' }}>
                      <span className="shrink-0 mt-0.5" style={{ color: '#a89e92' }}><IconHeart size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: '#3e3830' }}>
                          {fmtDate(s.start_time)} – {fmtDate(s.end_time)}
                        </p>
                        {s.note && <p className="text-[10px]" style={{ color: '#7a7068' }}>{s.note}</p>}
                      </div>
                      {isActive && <span className="text-[10px] font-semibold text-red-500 shrink-0 ml-auto">{ta.active}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Past events */}
          {detail.pastEvents.length > 0 && (
            <div className="px-5 py-4">
              <SectionLabel>{ta.history(detail.pastEvents.length)}</SectionLabel>
              <div className="space-y-0.5">
                {detail.pastEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2.5 py-1 px-2 opacity-50">
                    <span className="text-[10px] w-14 shrink-0" style={{ color: '#a89e92' }}>{fmtDate(ev.start_time).slice(0, 5)}</span>
                    <span className="text-xs truncate" style={{ color: '#5a524a' }}>{ev.type ?? ev.title}</span>
                    {ev.productionTitle && (
                      <span className="text-[10px] ml-auto shrink-0 truncate max-w-[80px]" style={{ color: '#a89e92' }}>{ev.productionTitle}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : null}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ArtistsPage() {
  const { t } = useLanguage()
  const ta = t.artists
  const [artists,      setArtists]      = useState<ArtistRow[]>([])
  const [productions,  setProductions]  = useState<ProductionForModal[]>([])
  const [loading,      setLoading]      = useState(true)

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [detail,       setDetail]       = useState<ArtistDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [modal,        setModal]        = useState<ArtistRow | null | undefined>(undefined)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortMode,     setSortMode]     = useState<'alpha' | 'core'>('alpha')

  // Auto-select artist from URL param (?select=<id>) and optionally open edit modal (?edit=1)
  const searchParams = useSearchParams()
  const selectParam  = searchParams.get('select')
  const editParam    = searchParams.get('edit')
  const tabParam     = searchParams.get('tab')

  useEffect(() => {
    if (!selectParam || artists.length === 0) return
    const target = artists.find(a => a.id === selectParam)
    if (!target) return
    selectArtist(target.id)
    if (editParam === '1') setModal(target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectParam, editParam, artists])

  useEffect(() => { fetchArtists() }, [])

  async function fetchArtists() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    // Okno „zeszłych miesięcy" — ostatnie 12 miesięcy, przeszłe spektakle
    const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 12)
    const yearAgoStr = yearAgo.toISOString().slice(0, 10)

    const [{ data: aData }, { data: pData }, { data: dsData }, { data: pastEv }] = await Promise.all([
      supabase.from('artists')
        .select('id, name, email, phone, role, birth_date, actor_type, is_core, avatar_url, teams!inner(name), artist_productions(production_id)')
        .eq('teams.name', 'Cast')
        .order('name'),
      supabase.from('productions').select('id, title, theatres(name)').order('title'),
      supabase.from('actor_day_status').select('artist_id, status').eq('date', today),
      supabase.from('events')
        .select('start_time, end_time, production_id, type, event_artists(artist_id)')
        .in('type', Array.from(SHOW_TYPES))
        .gte('start_time', `${yearAgoStr}T00:00:00`)
        .lt('start_time', `${today}T00:00:00`),
    ])

    const todayStatus: Record<string, string> = {}
    for (const r of ((dsData ?? []) as any[])) {
      todayStatus[r.artist_id] = r.status
    }

    // Produkcja → aktorzy (z obsady produkcji), do liczenia godzin gdy brak jawnej obsady wydarzenia
    const prodToArtists: Record<string, string[]> = {}
    for (const a of ((aData ?? []) as any[])) {
      for (const ap of (a.artist_productions ?? [])) (prodToArtists[ap.production_id] ??= []).push(a.id)
    }
    // Suma zagranych godzin + liczba spektakli per aktor (ost. 12 mies.)
    // Dublura (zastępstwo) = aktor w JAWNEJ obsadzie wydarzenia, ale NIE w regularnej
    // obsadzie produkcji (wskoczył za kogoś).
    const hoursByArtist: Record<string, number> = {}
    const playCountByArtist: Record<string, number> = {}
    const dublerByArtist: Record<string, number> = {}
    for (const ev of ((pastEv ?? []) as any[])) {
      const explicit = (ev.event_artists ?? []).map((e: any) => e.artist_id)
      const cast = explicit.length > 0 ? explicit : (prodToArtists[ev.production_id] ?? [])
      const dur = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 3.6e6
      const regular = new Set(prodToArtists[ev.production_id] ?? [])
      for (const aid of cast) {
        playCountByArtist[aid] = (playCountByArtist[aid] ?? 0) + 1
        if (dur > 0) hoursByArtist[aid] = (hoursByArtist[aid] ?? 0) + dur
        if (explicit.length > 0 && !regular.has(aid)) dublerByArtist[aid] = (dublerByArtist[aid] ?? 0) + 1
      }
    }

    setArtists(((aData ?? []) as any[]).map(a => ({
      id:              a.id,
      name:            a.name,
      email:           a.email ?? '',
      phone:           a.phone ?? null,
      role:            a.role ?? null,
      status:          todayStatus[a.id] ?? null,
      actor_type:      a.actor_type ?? null,
      avatar_url:      a.avatar_url ?? null,
      productionCount: (a.artist_productions ?? []).length,
      playedHours:     Math.round(hoursByArtist[a.id] ?? 0),
      playCount:       playCountByArtist[a.id] ?? 0,
      dublerCount:     dublerByArtist[a.id] ?? 0,
      is_core:         !!a.is_core,
    })))
    setProductions(((pData ?? []) as any[]).map(p => ({
      id: p.id, title: p.title,
      theatres: Array.isArray(p.theatres) ? (p.theatres[0] ?? null) : (p.theatres ?? null),
    })))
    setLoading(false)
  }

  async function fetchDetail(artistId: string) {
    setDetailLoading(true)
    const now = new Date().toISOString()

    const [{ data: apData }, { data: avData }, { data: eaData }, { data: confData }, { data: msgData }] = await Promise.all([
      supabase.from('artist_productions')
        .select('productions(id, title, status, theatres(name))')
        .eq('artist_id', artistId),
      supabase.from('availabilities')
        .select('id, type, start_time, end_time, note')
        .eq('artist_id', artistId)
        .in('type', ['Urlop', 'Niedostępny'])
        .order('start_time'),
      supabase.from('event_artists')
        .select('event_id')
        .eq('artist_id', artistId),
      supabase.from('event_confirmations')
        .select('id, status, sent_at, responded_at, comment, events(id, title, type, start_time, end_time, productions(title))')
        .eq('artist_id', artistId)
        .order('sent_at', { ascending: false })
        .limit(50),
      supabase.from('actor_messages')
        .select('id, type, subject, body, sent_at')
        .eq('artist_id', artistId)
        .order('sent_at', { ascending: false })
        .limit(50),
    ])

    const eventIds = (eaData ?? []).map((r: any) => r.event_id)

    let upcomingEvents: EventRef[] = []
    let pastEvents: EventRef[] = []

    if (eventIds.length > 0) {
      const [{ data: upData }, { data: pastData }] = await Promise.all([
        supabase.from('events')
          .select('id, title, type, start_time, end_time, rooms(name), productions(title)')
          .in('id', eventIds)
          .gte('start_time', now)
          .order('start_time')
          .limit(20),
        supabase.from('events')
          .select('id, title, type, start_time, end_time, productions(title)')
          .in('id', eventIds)
          .lt('start_time', now)
          .order('start_time', { ascending: false })
          .limit(15),
      ])

      upcomingEvents = ((upData ?? []) as any[]).map(e => {
        const rm   = Array.isArray(e.rooms)       ? e.rooms[0]       : e.rooms
        const prod = Array.isArray(e.productions)  ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: rm?.name ?? null, productionTitle: prod?.title ?? null }
      })
      pastEvents = ((pastData ?? []) as any[]).map(e => {
        const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
        return { id: e.id, title: e.title, type: e.type, start_time: e.start_time, end_time: e.end_time, room: null, productionTitle: prod?.title ?? null }
      })
    }

    const prods: ProductionRef[] = ((apData ?? []) as any[]).map(ap => {
      const p = Array.isArray(ap.productions) ? ap.productions[0] : ap.productions
      const th = p ? (Array.isArray(p.theatres) ? p.theatres[0] : p.theatres) : null
      return p ? { id: p.id, title: p.title, status: p.status, theatreName: th?.name ?? null } : null
    }).filter(Boolean) as ProductionRef[]

    const avRaw = ((avData ?? []) as any[])

    const confirmations: ConfirmationRef[] = ((confData ?? []) as any[]).map(c => {
      const ev = Array.isArray(c.events) ? c.events[0] : c.events
      const prod = ev ? (Array.isArray(ev.productions) ? ev.productions[0] : ev.productions) : null
      return {
        id: c.id, status: c.status, sent_at: c.sent_at,
        responded_at: c.responded_at ?? null, comment: c.comment ?? null,
        event: ev ? {
          id: ev.id, title: ev.title, type: ev.type,
          start_time: ev.start_time, end_time: ev.end_time,
          productionTitle: prod?.title ?? null,
        } : null,
      }
    })

    const messages: MessageRef[] = ((msgData ?? []) as any[]).map(m => ({
      id: m.id, type: m.type, subject: m.subject ?? null, body: m.body, sent_at: m.sent_at,
    }))

    setDetail({
      productions:    prods,
      upcomingEvents,
      pastEvents,
      vacations:  avRaw.filter(r => r.type === 'Urlop'),
      sicknesses: avRaw.filter(r => r.type === 'Niedostępny'),
      substitutes: [],
      confirmations,
      messages,
    })
    setDetailLoading(false)
  }

  function selectArtist(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return }
    setSelectedId(id)
    setDetail(null)
    fetchDetail(id)
  }

  const filtered = useMemo(() => {
    let list = artists
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q) || (a.role ?? '').toLowerCase().includes(q))
    }
    if (sortMode === 'core') {
      // CORE najpierw, w obu grupach wg aktywności (liczba spektakli / rok), potem alfabetycznie
      const alpha = sortByLastName(list)
      return [...alpha].sort((a, b) =>
        (Number(b.is_core) - Number(a.is_core)) || (b.playCount - a.playCount))
    }
    return sortByLastName(list)
  }, [artists, statusFilter, search, sortMode])

  const selectedArtist = artists.find(a => a.id === selectedId) ?? null

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: artists.length }
    for (const a of artists) c[a.status ?? 'Aktywny'] = (c[a.status ?? 'Aktywny'] ?? 0) + 1
    return c
  }, [artists])

  const statusOptions = ['Dostępny', 'Dostępny tylko w Warszawie', 'Niepewny', 'Niedostępny', 'Urlop']

  return (
    <>
      {modal !== undefined && (
        <ArtistModal
          artist={modal}
          productions={productions}
          allActors={artists.map(a => ({ id: a.id, name: a.name, role: a.role }))}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            fetchArtists()
            if (selectedId) fetchDetail(selectedId)
          }}
        />
      )}

      <div className="flex gap-0 -m-4 md:-m-8 md:h-screen md:overflow-hidden">

        {/* ── Left: list ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 md:px-8 py-4 md:py-5 shrink-0"
            style={{ borderBottom: '1px solid #e4ddd4', background: '#fff' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
                {ta.title}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>{ta.total(artists.length)}</p>
            </div>
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
              style={{ background: '#c8102e', color: '#fff' }}
              onMouseOver={e => (e.currentTarget.style.background = '#9e0c24')}
              onMouseOut={e => (e.currentTarget.style.background = '#c8102e')}
            >
              {ta.addButton}
            </button>
          </div>

          {/* Search + filter */}
          <div className="px-4 md:px-8 py-3 shrink-0 flex items-center gap-3 flex-wrap"
            style={{ borderBottom: '1px solid #e4ddd4', background: '#faf8f5' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ta.searchPlaceholder}
              className="flex-1 min-w-[180px] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
              style={{ border: '1px solid #e4ddd4', background: '#fff', color: '#1a1410' }}
            />
            {/* Sortowanie */}
            <div className="flex items-center gap-0.5 rounded-lg p-0.5 shrink-0" style={{ background: '#ede7df' }}>
              {([['alpha', 'Alfabetycznie'], ['core', 'Core + aktywność']] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setSortMode(k)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
                  style={sortMode === k
                    ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                    : { color: '#a89e92' }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {[{ key: 'all', label: ta.all }, ...statusOptions.map(s => ({ key: s, label: s }))].map(f => {
                const isActive = statusFilter === f.key
                const badgeCls = isActive && f.key !== 'all'
                  ? (STATUS_STYLE[f.key]?.badge ?? 'bg-[#3e3830] text-white')
                  : ''
                return (
                  <button key={f.key} onClick={() => setStatusFilter(f.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${badgeCls}`}
                    style={isActive && f.key === 'all'
                      ? { background: '#1a1410', color: '#fff' }
                      : !isActive
                        ? { color: '#7a7068' }
                        : undefined}
                  >
                    {f.label}
                    {statusCounts[f.key] != null && (
                      <span className="ml-1 opacity-60">{statusCounts[f.key]}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 md:overflow-y-auto px-4 md:px-8 py-4" style={{ background: '#f2ede6' }}>
            {loading ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#a89e92' }}>{ta.loading}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="flex justify-center mb-3"><span style={{ color: '#cec5b8' }}><IconTheatre size={48} className="mx-auto" /></span></div>
                <p className="text-sm font-medium" style={{ color: '#7a7068' }}>{ta.empty}</p>
                {search && <p className="text-xs mt-1" style={{ color: '#a89e92' }}>{ta.emptyHint}</p>}
              </div>
            ) : (
              <div className={`grid gap-2 ${selectedArtist ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                {filtered.map(a => (
                  <ArtistCard key={a.id} artist={a} isSelected={selectedId === a.id} onClick={() => selectArtist(a.id)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: profile panel ─────────────────────────────────── */}
        <div
          className={
            selectedArtist
              ? 'fixed inset-0 z-[60] overflow-y-auto bg-white md:static md:inset-auto md:z-auto md:w-80 md:shrink-0 md:overflow-hidden md:bg-transparent md:transition-all md:duration-200'
              : 'hidden md:block md:w-0 md:shrink-0 md:overflow-hidden md:transition-all md:duration-200'
          }
          style={{ borderLeft: '1px solid #e4ddd4' }}>
          {selectedArtist && (
            <ProfilePanel
              artist={selectedArtist}
              detail={detail}
              loading={detailLoading}
              onEdit={() => setModal(selectedArtist)}
              onClose={() => { setSelectedId(null); setDetail(null) }}
              onDetailRefresh={() => { if (selectedId) fetchDetail(selectedId) }}
              allActors={artists.map(a => ({ id: a.id, name: a.name, role: a.role, avatar_url: a.avatar_url }))}
              initialTab={tabParam === 'subs' ? 'subs' : undefined}
            />
          )}
        </div>

      </div>
    </>
  )
}
