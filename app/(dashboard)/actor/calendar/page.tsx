'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'
import { useOrg } from '@/lib/org-context'
import { googleCalendarUrl } from '@/lib/gcal'

// ── Types ────────────────────────────────────────────────────────────────────

interface Production {
  id: string
  title: string
  theatre: string | null
  location_type: string
  color: string
}

interface DayEvent {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  production_id: string | null
  production: string | null
  room: string | null
  isMine: boolean    // true = actor in event_artists (gra w tym spektaklu)
  isDubler: boolean  // true = actor jest dublerem tego tytułu (gotowość na zastępstwo)
}

interface DayStatus {
  date: string   // YYYY-MM-DD
  status: string
  note: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_STATUSES = [
  { value: 'Dostępny',                   cls: 'bg-green-600 text-white',        dot: 'bg-green-500',   icon: '✓' },
  { value: 'Dostępny tylko w Warszawie', cls: 'bg-emerald-900 text-white',      dot: 'bg-emerald-600', icon: '✓W' },
  { value: 'Niepewny',                   cls: 'bg-orange-500 text-white',       dot: 'bg-orange-400',  icon: '?' },
  { value: 'Niedostępny',                cls: 'bg-red-600 text-white',          dot: 'bg-red-500',     icon: '✗' },
  { value: 'Urlop',                      cls: 'bg-amber-400 text-black',        dot: 'bg-amber-400',   icon: '☀' },
]

// Single neutral style for all production badges
const PROD_COLORS = [
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
  { bg: 'bg-white',  text: 'text-gray-800',  pill: 'bg-white text-gray-900 border border-gray-900' },
]

const BLOCKING_STATUSES = new Set(['Urlop', 'Niedostępny', 'Choroba'])

const DAYS_PL = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtTime(iso: string) {
  // Eventy zapisane jako „ściana zegara" w UTC (19:00+00:00 = 19:00 Warszawa) — bierzemy
  // getUTC*, inaczej przeglądarka przesuwałaby godzinę o +1/+2h.
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  // Week starts Monday. getDay(): 0=Sun,1=Mon…6=Sat
  const startPad = (first.getDay() + 6) % 7  // Mon=0
  const days: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

// ── Event drawer (wysuwany z prawej, jak w Wydarzeniach) ──────────────────────

function ActorEventDrawer({ ev, onClose }: { ev: DayEvent; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOpen(true), 10); return () => clearTimeout(t) }, [])
  const close = () => { setOpen(false); setTimeout(onClose, 200) }

  const dateLabel = new Date(ev.start_time.slice(0, 10) + 'T12:00:00')
    .toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
  const heading = ev.type ?? ev.title

  return (
    <div className="fixed inset-0 z-[80]">
      <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={ev.isMine ? { background: '#1a1410', color: '#fff' } : ev.isDubler ? { background: '#ede9fe', color: '#6d28d9' } : { background: '#f2ede6', color: '#7a7068' }}>
              {ev.isMine ? 'Jesteś w obsadzie' : ev.isDubler ? 'Dubler — gotowość' : (ev.type ?? 'Wydarzenie')}
            </span>
            <button onClick={close} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f2ede6', color: '#7a7068' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.4rem', fontWeight: 700, color: '#1a1410', lineHeight: 1.2 }}>{heading}</h2>
          <p className="text-sm capitalize mt-1" style={{ color: '#7a7068' }}>{dateLabel}</p>

          <div className="mt-5 space-y-3 text-sm" style={{ color: '#3e3830' }}>
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a89e92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
            </div>
            {ev.room && (
              <div className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a89e92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {ev.room}
              </div>
            )}
          </div>

          {ev.production && ev.production !== heading && (
            <div className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#b8b0a4' }}>Produkcja</p>
              <span className="inline-block text-sm px-2.5 py-1 rounded-full" style={{ background: '#f2ede6', color: '#5a524a' }}>{ev.production}</span>
            </div>
          )}

          {/* Dodaj do Google Calendar */}
          <a
            href={googleCalendarUrl({
              title: ev.production ?? ev.title,
              start: ev.start_time,
              end: ev.end_time,
              location: ev.room ?? undefined,
              details: `${ev.type ?? 'Spektakl'} — Teatr.`,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full mt-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ border: '1px solid #e4ddd4', color: '#5a524a' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5M12 12.75h.008v.008H12v-.008z"/></svg>
            Dodaj do Google Calendar
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActorCalendarPage() {
  const { actorId, actorName } = useProfile()
  const { org } = useOrg()
  // TD: model „domyślnie Dostępny" — dni bez wpisu pokazujemy jako zielone (Dostępny),
  // aktor odznacza tylko dni, gdy nie może. (Inne teatry: brak wpisu = neutralny.)
  const defaultAvailable = org?.slug === 'teatr-dramatyczny'
  const dispStatus = (s?: DayStatus): string | undefined => s?.status ?? (defaultAvailable ? 'Dostępny' : undefined)
  const router = useRouter()

  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [events,        setEvents]        = useState<DayEvent[]>([])
  const [statuses,      setStatuses]      = useState<DayStatus[]>([])
  const [prods,         setProds]         = useState<Production[]>([])
  const [globalStatus,  setGlobalStatus]  = useState<string | null>(null)
  const [selected,      setSelected]      = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [noteInput,     setNoteInput]     = useState('')
  const [loading,       setLoading]       = useState(true)
  // Pending (unsaved) changes: dateStr → status
  const [pending,       setPending]       = useState<Record<string, string>>({})
  // Multi-select
  const [multiMode,     setMultiMode]     = useState(false)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set())
  // Day filter for the vertical list (mini-calendar click)
  const [filterDay,     setFilterDay]     = useState<string | null>(null)
  // Event drawer (szczegóły wydarzenia, wysuwany z prawej)
  const [selectedEvent, setSelectedEvent] = useState<DayEvent | null>(null)
  // Miesiące z zatwierdzonym/wdrożonym repertuarem — kalendarz zablokowany
  const [lockedMonths,  setLockedMonths]  = useState<Set<string>>(new Set())
  const viewMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const monthApproved = lockedMonths.has(viewMonthKey)

  // Prawy drawer ze szczegółami dnia — animacja wjazdu/wyjazdu
  const panelActive = !!selected || multiMode
  const [panelShown, setPanelShown] = useState(false)
  useEffect(() => {
    if (panelActive) { const t = setTimeout(() => setPanelShown(true), 10); return () => clearTimeout(t) }
    setPanelShown(false)
  }, [panelActive])

  // Redirect if no actor selected
  useEffect(() => {
    if (!actorId) router.push('/dashboard')
  }, [actorId, router])

  const loadData = useCallback(async () => {
    if (!actorId) return
    setLoading(true)

    const rangeStart = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-01`
    const nextMonth  = new Date(viewYear, viewMonth + 1, 1)
    const rangeEnd   = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,'0')}-01`

    // Global status from coordinator profile
    const { data: artistData } = await supabase
      .from('artists')
      .select('status')
      .eq('id', actorId)
      .single()
    if (artistData) setGlobalStatus((artistData as any).status ?? null)

    // Productions assigned by coordinator — two-step (avoids FK join issues)
    const { data: apData } = await supabase
      .from('artist_productions')
      .select('production_id')
      .eq('artist_id', actorId)

    const productionIds = ((apData ?? []) as any[]).map(r => r.production_id).filter(Boolean)

    // Produkcje, w których aktor jest DUBLEREM — musi trzymać te terminy wolne (gotowość)
    const { data: subData } = await supabase
      .from('actor_production_substitutes')
      .select('production_id')
      .eq('substitute_id', actorId)
    const dublerProdSet = new Set(((subData ?? []) as any[]).map(r => r.production_id).filter(Boolean))
    const allProductionIds = [...new Set([...productionIds, ...dublerProdSet])]

    const { data: prodData } = productionIds.length > 0
      ? await supabase
          .from('productions')
          .select('id, title, location_type, theatres(name)')
          .in('id', productionIds)
          .order('title')
      : { data: [] }

    // Events this actor is assigned to this month (event_artists)
    const { data: eaData } = await supabase
      .from('event_artists')
      .select('event_id')
      .eq('artist_id', actorId)

    const myEventIds = new Set(((eaData ?? []) as any[]).map(r => r.event_id))

    // Wydarzenia miesiąca: produkcje aktora + produkcje, w których jest dublerem
    let evList: DayEvent[] = []
    if (allProductionIds.length > 0) {
      const { data: evData } = await supabase
        .from('events')
        .select('id, title, type, start_time, end_time, rooms(name), productions(id, title)')
        .in('production_id', allProductionIds)
        .gte('start_time', `${rangeStart}T00:00:00`)
        .lt('start_time',  `${rangeEnd}T00:00:00`)
        .order('start_time')

      evList = ((evData ?? []) as any[]).map(e => {
        const rm   = Array.isArray(e.rooms)      ? e.rooms[0]      : e.rooms
        const prod = Array.isArray(e.productions) ? e.productions[0]: e.productions
        const mine = myEventIds.has(e.id)
        return {
          id: e.id, title: e.title, type: e.type,
          start_time: e.start_time, end_time: e.end_time,
          production_id: prod?.id ?? null,
          production: prod?.title ?? null,
          room: rm?.name ?? null,
          isMine: mine,
          // dubler tego tytułu i NIE gra w tym wydarzeniu → gotowość na zastępstwo
          isDubler: !mine && !!prod?.id && dublerProdSet.has(prod.id),
        }
      })
    }

    // Per-day statuses
    const { data: stData } = await supabase
      .from('actor_day_status')
      .select('date, status, note')
      .eq('artist_id', actorId)
      .gte('date', rangeStart)
      .lt('date',  rangeEnd)

    setProds(((prodData ?? []) as any[]).map((p, idx) => {
      const th = p.theatres
        ? (Array.isArray(p.theatres) ? p.theatres[0] : p.theatres)
        : null
      return {
        id: p.id,
        title: p.title,
        theatre: th?.name ?? null,
        location_type: p.location_type ?? 'Na miejscu',
        color: String(idx % PROD_COLORS.length),
      }
    }))

    setEvents(evList)
    setStatuses((stData ?? []) as DayStatus[])
    setLoading(false)
  }, [actorId, viewYear, viewMonth])

  useEffect(() => { loadData() }, [loadData])

  // Miesiące z zatwierdzonym (= też wdrożonym) repertuarem → blokada zmian dostępności
  useEffect(() => {
    supabase.from('repertoire_proposals').select('month').eq('status', 'approved')
      .then(({ data }) => setLockedMonths(new Set((data ?? []).map((r: any) => r.month))))
  }, [])

  function getStatusForDate(dateStr: string): DayStatus | undefined {
    return statuses.find(s => s.date === dateStr)
  }

  function toggleMultiDate(dateStr: string) {
    setMultiSelected(prev => {
      const next = new Set(prev)
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr)
      return next
    })
  }

  function exitMultiMode() {
    setMultiMode(false)
    setMultiSelected(new Set())
  }

  // Zamknij prawy drawer z animacją wyjazdu
  function closePanel() {
    setPanelShown(false)
    setTimeout(() => { setSelected(null); exitMultiMode() }, 200)
  }

  // Alarm do koordynatora, gdy niedostępność koliduje z repertuarem
  function notifyCoordinator(days: { date: string; status: string; note?: string | null }[]) {
    if (!actorId) return
    fetch('/api/notify/availability-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: actorId, days }),
    }).catch(() => {})
  }

  // Multi-select: save immediately with delete → insert
  async function applyStatusToSelected(status: string) {
    if (!actorId || multiSelected.size === 0) return
    // Pomiń dni zablokowane (granie w zatwierdzonym repertuarze)
    const dates = Array.from(multiSelected).filter(d => !isDayLocked(d))
    if (dates.length === 0) { exitMultiMode(); return }
    setSaving(true)
    setSaveError(null)

    const { error: delErr } = await supabase
      .from('actor_day_status')
      .delete()
      .eq('artist_id', actorId)
      .in('date', dates)

    if (delErr) { setSaveError('Błąd zapisu: ' + delErr.message); setSaving(false); return }

    const { error: insErr } = await supabase
      .from('actor_day_status')
      .insert(dates.map(date => ({ artist_id: actorId, date, status, note: null })))

    if (!insErr) {
      setStatuses(prev => {
        const dateSet = new Set(dates)
        const filtered = prev.filter(s => !dateSet.has(s.date))
        return [...filtered, ...dates.map(date => ({ date, status, note: null }))]
      })
      setPending(prev => {
        const next = { ...prev }
        dates.forEach(d => delete next[d])
        return next
      })
      notifyCoordinator(dates.map(date => ({ date, status, note: null })))
    } else {
      setSaveError('Błąd zapisu: ' + insErr.message)
    }
    setSaving(false)
    exitMultiMode()
  }

  function getEventsForDate(dateStr: string): DayEvent[] {
    return events.filter(e => e.start_time.slice(0, 10) === dateStr)
  }

  // Blokada dotyczy dni, w których aktor GRA spektakl z zatwierdzonego repertuaru
  // ORAZ dni, w których jest DUBLEREM granego tytułu (musi być w gotowości).
  // Pozostałe dni miesiąca pozostają edytowalne.
  function isDayLocked(dateStr: string): boolean {
    if (!lockedMonths.has(dateStr.slice(0, 7))) return false
    return getEventsForDate(dateStr).some(e => e.isMine || e.isDubler)
  }

  // Powód blokady: 'play' (gra), 'dubler' (gotowość) lub null.
  function dayLockReason(dateStr: string): 'play' | 'dubler' | null {
    if (!lockedMonths.has(dateStr.slice(0, 7))) return null
    const evs = getEventsForDate(dateStr)
    if (evs.some(e => e.isMine)) return 'play'
    if (evs.some(e => e.isDubler)) return 'dubler'
    return null
  }

  // Mark a day's status locally (not saved yet)
  function markDayStatus(dateStr: string, status: string) {
    if (isDayLocked(dateStr)) return
    setPending(prev => ({ ...prev, [dateStr]: status }))
  }

  // Effective status for a date: pending overrides saved
  function effectiveStatus(dateStr: string): DayStatus | undefined {
    if (pending[dateStr] !== undefined) {
      const saved = getStatusForDate(dateStr)
      return { date: dateStr, status: pending[dateStr], note: saved?.note ?? null }
    }
    return getStatusForDate(dateStr)
  }

  // Save all pending changes + note to Supabase (delete → insert to avoid upsert issues)
  async function saveAll() {
    if (!actorId) return
    setSaving(true)
    setSaveError(null)

    // Build full set of changes: pending statuses + note for selected day
    // (pomijamy dni zablokowane — granie w zatwierdzonym repertuarze)
    const toSave: { date: string; status: string; note: string | null }[] = []

    const pendingEntries = Object.entries(pending)
    for (const [date, status] of pendingEntries) {
      if (isDayLocked(date)) continue
      const isSelected = date === selected
      toSave.push({
        date,
        status,
        note: isSelected ? (noteInput || null) : (getStatusForDate(date)?.note ?? null),
      })
    }

    // If selected day has no pending status change but has a note change, add it too
    if (selected && !pending[selected] && !isDayLocked(selected)) {
      const existingSt = getStatusForDate(selected)
      if (existingSt) {
        toSave.push({ date: selected, status: existingSt.status, note: noteInput || null })
      }
    }

    if (toSave.length > 0) {
      const dates = toSave.map(r => r.date)

      // Delete existing rows for these dates first
      const { error: delErr } = await supabase
        .from('actor_day_status')
        .delete()
        .eq('artist_id', actorId)
        .in('date', dates)

      if (delErr) { setSaveError('Błąd zapisu: ' + delErr.message); setSaving(false); return }

      // Insert fresh rows
      const { error: insErr } = await supabase
        .from('actor_day_status')
        .insert(toSave.map(r => ({ artist_id: actorId, date: r.date, status: r.status, note: r.note })))

      if (insErr) { setSaveError('Błąd zapisu: ' + insErr.message); setSaving(false); return }

      // Update local state
      setStatuses(prev => {
        const dateSet = new Set(dates)
        const filtered = prev.filter(s => !dateSet.has(s.date))
        return [...filtered, ...toSave]
      })
      setPending({})
      notifyCoordinator(toSave)
    }

    setSaving(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const days    = getMonthDays(viewYear, viewMonth)
  const todayStr = toDateStr(today)

  const selectedStatus = selected ? getStatusForDate(selected) : undefined
  const selectedEvents = selected ? getEventsForDate(selected) : []

  if (!actorId) return null

  return (
    <div className="flex gap-0 md:gap-6 h-full -m-4 md:-m-8">

      {/* ── Left: calendar ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Mój Kalendarz</h1>
              <p className="text-xs text-gray-500 mt-0.5">{actorName}</p>
            </div>
            <button
              onClick={() => { setMultiMode(v => !v); setMultiSelected(new Set()) }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                multiMode
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {multiMode ? `Zaznaczono ${multiSelected.size}` : 'Zaznacz wiele'}
            </button>
          </div>

            {/* Global status + productions strip — only show "Na wyjeździe" productions */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {globalStatus && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                DAY_STATUSES.find(s => s.value === globalStatus)?.cls ?? 'bg-gray-100 text-gray-600'
              }`}>
                Ogólnie: {globalStatus}
              </span>
            )}
            {prods.filter(p => p.location_type === 'Na wyjeździe').map(p => (
              <span key={p.id} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white border border-gray-900 text-gray-900">
                ✈ {p.title}{p.theatre ? ` · ${p.theatre}` : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Repertuar zatwierdzony — zablokowane są tylko dni z Twoimi spektaklami */}
        {monthApproved && (
          <div className="px-4 md:px-8 py-2.5 border-b shrink-0 flex items-center gap-2" style={{ background: '#f2ede6', borderColor: '#e4ddd4' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7a7068" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span className="text-xs font-medium" style={{ color: '#5a524a' }}>
              Repertuar na <b>{MONTHS_PL[viewMonth]} {viewYear}</b> jest zatwierdzony — zablokowane są dni, w których grasz spektakle oraz dni, w których jesteś dublerem granego tytułu (gotowość na zastępstwo) 🔒. Pozostałe dni możesz nadal edytować.
            </span>
          </div>
        )}

        {/* Unsaved changes banner */}
        {(Object.keys(pending).length > 0 && !selected) && (
          <div className="px-4 md:px-8 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-amber-700">
              Niezapisane zmiany: {Object.keys(pending).length} {Object.keys(pending).length === 1 ? 'dzień' : 'dni'}
            </span>
            <button
              onClick={saveAll}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </div>
        )}

        {/* Save error */}
        {saveError && (
          <div className="px-4 md:px-8 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-red-600 font-medium">{saveError}</span>
            <button onClick={() => setSaveError(null)} className="text-xs text-red-400 hover:text-red-600 ml-3">✕</button>
          </div>
        )}

        {/* Content: mini calendar + vertical day list (Events-tab style) */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Ładowanie…</div>
          ) : (
            <div className="space-y-5">

              {/* ── Big month calendar card ── */}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e4ddd4' }}>
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f2ede6' }}>
                  <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100 text-gray-500 text-lg">‹</button>
                  <div className="flex items-center gap-3">
                    <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1a1410' }}>{MONTHS_PL[viewMonth]}</h2>
                    <span className="text-sm font-medium" style={{ color: '#a89e92' }}>{viewYear}</span>
                    <button
                      onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                      style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                    >
                      Dziś
                    </button>
                  </div>
                  <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100 text-gray-500 text-lg">›</button>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                  {DAYS_PL.map(d => (
                    <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: d === 'So' || d === 'Nd' ? '#cec5b8' : '#a89e92' }}>{d}</div>
                  ))}
                </div>

                {/* Days — big cells with event titles (jak w Wydarzeniach) */}
                <div className="grid grid-cols-7 gap-1 px-3 pb-4">
                  {days.map((day, i) => {
                    if (!day) return <div key={`pad-${i}`} />
                    const dateStr    = toDateStr(day)
                    const isToday    = dateStr === todayStr
                    const isSel      = !multiMode && dateStr === selected
                    const isMultiSel = multiMode && multiSelected.has(dateStr)
                    const isDark     = isSel || isMultiSel
                    const isSbSn     = day.getDay() === 0 || day.getDay() === 6
                    const dayEvs     = getEventsForDate(dateStr)
                    const daySt      = effectiveStatus(dateStr)
                    const stDef      = DAY_STATUSES.find(s => s.value === dispStatus(daySt))
                    const isBlocking = daySt && BLOCKING_STATUSES.has(daySt.status)
                    const hasConflict = isBlocking && dayEvs.length > 0
                    const dayLocked  = isDayLocked(dateStr)

                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          if (multiMode) toggleMultiDate(dateStr)
                          else { setSelectedEvent(null); setNoteInput(getStatusForDate(dateStr)?.note ?? ''); setSelected(prev => prev === dateStr ? null : dateStr) }
                        }}
                        className="flex flex-col items-stretch gap-1 p-1.5 rounded-xl transition-all text-left min-h-[88px] overflow-hidden"
                        style={{
                          background: isDark ? '#1a1410' : isToday ? '#f2ede6' : 'transparent',
                          border: isToday && !isDark ? '1px solid #e4ddd4' : '1px solid transparent',
                        }}
                        onMouseOver={e => { if (!isDark) e.currentTarget.style.background = '#f8f5f1' }}
                        onMouseOut={e => { e.currentTarget.style.background = isDark ? '#1a1410' : isToday ? '#f2ede6' : 'transparent' }}
                      >
                        {/* Day number + availability indicator */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-lg shrink-0"
                            style={{ color: isDark ? '#fff' : isToday ? '#1a1410' : isSbSn ? '#cec5b8' : '#3e3830' }}>
                            {day.getDate()}
                          </span>
                          {dayLocked
                            ? <span className="shrink-0" title={dayLockReason(dateStr) === 'dubler' ? 'Jesteś dublerem granego tytułu — dostępność w gotowości (zablokowana)' : 'Grasz spektakl — dostępność zablokowana'}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#fff' : (dayLockReason(dateStr) === 'dubler' ? '#8b5cf6' : '#a89e92')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </span>
                            : hasConflict
                            ? <span className="text-[11px] leading-none shrink-0" title="Kolizja statusu z wydarzeniem">⚠️</span>
                            : stDef && <span className={`w-2 h-2 rounded-full shrink-0 ${stDef.dot}`} title={dispStatus(daySt)} />}
                        </div>

                        {/* Event titles */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {dayEvs.slice(0, 2).map((e, di) => (
                            <span key={di} className="text-[9px] leading-tight px-1 py-0.5 rounded truncate"
                              style={e.isMine
                                ? { background: isDark ? 'rgba(255,255,255,0.22)' : '#1a1410', color: '#fff' }
                                : { background: isDark ? 'rgba(255,255,255,0.12)' : '#ece5dc', color: isDark ? '#fff' : '#5a524a' }}>
                              {e.title}
                            </span>
                          ))}
                          {dayEvs.length > 2 && (
                            <span className="text-[9px] px-1 font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#a89e92' }}>
                              +{dayEvs.length - 2} więcej
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid #f2ede6' }}>
                  <span className="text-xs" style={{ color: '#a89e92' }}>
                    {events.length} {events.length === 1 ? 'wydarzenie' : 'wydarzeń'} w miesiącu
                  </span>
                  {filterDay && !multiMode && (
                    <button onClick={() => setFilterDay(null)} className="text-xs underline decoration-dotted underline-offset-2" style={{ color: '#7a7068' }}>
                      Pokaż wszystkie
                    </button>
                  )}
                </div>
              </div>

              {/* ── Vertical day-by-day list ── */}
              {(() => {
                const monthDays = days.filter((d): d is Date => d !== null)
                const visible = monthDays.filter(d => {
                  const ds = toDateStr(d)
                  if (filterDay && !multiMode) return ds === filterDay
                  return getEventsForDate(ds).length > 0 || !!effectiveStatus(ds)
                })

                if (visible.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <p className="text-sm" style={{ color: '#a89e92' }}>
                        {filterDay ? 'Brak wydarzeń i statusu tego dnia' : 'Brak wydarzeń i statusów w tym miesiącu'}
                      </p>
                      {filterDay && (
                        <button
                          onClick={() => { setSelected(filterDay); setNoteInput(getStatusForDate(filterDay)?.note ?? '') }}
                          className="mt-3 px-4 py-2 text-xs font-semibold rounded-xl bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                        >
                          Ustaw status na ten dzień
                        </button>
                      )}
                    </div>
                  )
                }

                return (
                  <div className="space-y-6">
                    {visible.map(day => {
                      const dateStr    = toDateStr(day)
                      const dayEvs     = getEventsForDate(dateStr)
                      const daySt      = effectiveStatus(dateStr)
                      const isPending  = pending[dateStr] !== undefined
                      const stDef      = DAY_STATUSES.find(s => s.value === dispStatus(daySt))
                      const isBlocking = daySt && BLOCKING_STATUSES.has(daySt.status)
                      const hasConflict = isBlocking && dayEvs.length > 0
                      const savedNote  = getStatusForDate(dateStr)?.note

                      return (
                        <div key={dateStr}>
                          {/* Day header */}
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>
                              {day.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                            {dispStatus(daySt) && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stDef?.cls ?? 'bg-gray-100 text-gray-600'} ${isPending ? 'opacity-70' : ''}`}>
                                {isPending && '● '}{dispStatus(daySt)}
                              </span>
                            )}
                            <button
                              onClick={() => { setSelected(dateStr); setNoteInput(getStatusForDate(dateStr)?.note ?? '') }}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-gray-100"
                              style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                            >
                              {daySt ? 'Edytuj' : 'Ustaw status'}
                            </button>
                          </div>

                          {/* Conflict warning */}
                          {hasConflict && (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-2">
                              <p className="text-[11px] font-semibold text-orange-700">
                                ⚠ Status „{daySt!.status}" koliduje z {dayEvs.length} {dayEvs.length === 1 ? 'wydarzeniem' : 'wydarzeniami'} tego dnia
                              </p>
                            </div>
                          )}

                          {/* Note */}
                          {savedNote && (
                            <p className="text-xs italic mb-2 border-l-2 pl-2" style={{ color: '#7a7068', borderColor: '#e4ddd4' }}>
                              „{savedNote}"
                            </p>
                          )}

                          {/* Events */}
                          {dayEvs.length > 0 ? (
                            <div className="space-y-2">
                              {dayEvs.map(ev => (
                                <button
                                  key={ev.id}
                                  onClick={() => setSelectedEvent(ev)}
                                  className={`w-full text-left rounded-2xl p-3.5 transition-all hover:shadow-md ${ev.isMine ? 'bg-gray-900' : 'bg-white border border-gray-200'}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className={`text-sm font-semibold ${ev.isMine ? 'text-white' : 'text-gray-800'}`}>
                                        {ev.type ?? ev.title}
                                      </p>
                                      <p className={`text-xs mt-0.5 ${ev.isMine ? 'text-gray-300' : 'text-gray-500'}`}>
                                        {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                                        {ev.room ? ` · ${ev.room}` : ''}
                                      </p>
                                    </div>
                                    {ev.isMine ? (
                                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-gray-900">
                                        Obsada
                                      </span>
                                    ) : ev.isDubler ? (
                                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                                        Dubler
                                      </span>
                                    ) : null}
                                  </div>
                                  {ev.production && ev.production !== (ev.type ?? ev.title) && (
                                    <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                      ev.isMine ? 'bg-white/15 text-white' : 'border border-gray-300 text-gray-600 bg-white'
                                    }`}>
                                      {ev.production}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs italic" style={{ color: '#a89e92' }}>Brak wydarzeń tego dnia</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: day detail drawer (wysuwany z prawej) ──────────────────── */}
      {panelActive && (
      <div className="fixed inset-0 z-[60]">
        <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${panelShown ? 'opacity-100' : 'opacity-0'}`} onClick={closePanel} />
        <div className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden transition-transform duration-200 ${panelShown ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* ── Multi-select panel ── */}
        {multiMode && (
          <>
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  {multiSelected.size > 0 ? `${multiSelected.size} ${multiSelected.size === 1 ? 'dzień' : 'dni'}` : 'Zaznacz dni'}
                </h3>
                <button onClick={closePanel} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl">×</button>
              </div>
              {multiSelected.size === 0 && (
                <p className="text-xs text-gray-400 mt-1">Kliknij dni w kalendarzu, żeby je zaznaczyć</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Ustaw status dla zaznaczonych</p>
              <div className="flex flex-col gap-1">
                {DAY_STATUSES.map(opt => (
                  <button
                    key={opt.value}
                    disabled={saving || multiSelected.size === 0}
                    onClick={() => applyStatusToSelected(opt.value)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 transition-all text-xs font-semibold disabled:opacity-40 ${opt.cls} border-transparent`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 bg-white/70" />
                    {opt.value}
                  </button>
                ))}
              </div>
              {saveError && <p className="mt-3 text-xs text-red-600 font-medium">{saveError}</p>}
            </div>
          </>
        )}

        {/* ── Single-day panel ── */}
        {!multiMode && selected && (() => {
          const d = new Date(selected + 'T12:00:00')
          // odmieniony miesiąc: „17 sierpnia", nie „17 Sierpień"
          const dayLabel = `${DAYS_PL[(d.getDay() + 6) % 7]}, ${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`
          const daySt    = effectiveStatus(selected)
          const hasPendingChanges = Object.keys(pending).length > 0

          return (
            <>
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">{dayLabel}</h3>
                  <button onClick={closePanel} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* Status picker */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Mój status na ten dzień</p>
                  {isDayLocked(selected) ? (
                    <div className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: '#f2ede6', color: '#7a7068' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      <span>{dayLockReason(selected) === 'dubler'
                        ? 'Jesteś dublerem tytułu granego tego dnia z zatwierdzonego repertuaru — musisz być w gotowości, więc dostępności tego dnia nie można zmieniać.'
                        : 'Grasz spektakl z zatwierdzonego repertuaru — dostępności tego dnia nie można zmieniać.'}{daySt ? ` Obecnie: ${daySt.status}.` : ''}</span>
                    </div>
                  ) : (
                  <div className="flex flex-col gap-1">
                    {DAY_STATUSES.map(opt => (
                      <button
                        key={opt.value}
                        disabled={saving}
                        onClick={() => markDayStatus(selected, opt.value)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 transition-all text-xs font-semibold ${
                          daySt?.status === opt.value
                            ? `${opt.cls} border-transparent`
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${daySt?.status === opt.value ? 'bg-white/70' : opt.dot}`} />
                        {opt.value}
                      </button>
                    ))}
                    {(daySt || pending[selected]) && (
                      <button
                        onClick={async () => {
                          if (!actorId) return
                          await supabase.from('actor_day_status').delete().eq('artist_id', actorId).eq('date', selected)
                          setStatuses(prev => prev.filter(s => s.date !== selected))
                          setPending(prev => { const n = { ...prev }; delete n[selected]; return n })
                        }}
                        className="text-xs text-gray-400 hover:text-red-500 text-center transition-colors mt-1"
                      >
                        Usuń status
                      </button>
                    )}
                  </div>
                  )}
                </div>

                {/* Note — tylko dla dni edytowalnych */}
                {!isDayLocked(selected) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Notatka</p>
                  <textarea
                    rows={3}
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder="Opcjonalna informacja dla koordynatora…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button
                    onClick={saveAll}
                    disabled={saving}
                    className="mt-2 w-full py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Zapisywanie…' : `Zapisz${hasPendingChanges ? ` (${Object.keys(pending).length + 1})` : ''}`}
                  </button>
                  {saveError && (
                    <p className="mt-2 text-xs text-red-600 font-medium">{saveError}</p>
                  )}
                </div>
                )}

                {/* Conflict warning */}
                {(() => {
                  const st = effectiveStatus(selected)
                  const hasEvs = selectedEvents.length > 0
                  if (st && BLOCKING_STATUSES.has(st.status) && hasEvs) {
                    return (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                        <p className="text-xs font-bold text-orange-700">⚠ Kolizja z produkcją</p>
                        <p className="text-[11px] text-orange-600 mt-0.5">
                          Status <strong>{st.status}</strong> koliduje z {selectedEvents.length} {selectedEvents.length === 1 ? 'wydarzeniem' : 'wydarzeniami'} tego dnia.
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}

                {/* My events */}
                {selectedEvents.filter(e => e.isMine).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                      Jestem obsadzona/y
                    </p>
                    <div className="flex flex-col gap-2">
                      {selectedEvents.filter(e => e.isMine).map(ev => (
                        <div key={ev.id} className="p-2.5 rounded-xl bg-gray-900">
                          <p className="text-xs font-semibold text-white">{ev.type ?? ev.title}</p>
                          <p className="text-[11px] mt-0.5 text-gray-300">
                            {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                            {ev.room ? ` · ${ev.room}` : ''}
                          </p>
                          {ev.production && ev.production !== (ev.type ?? ev.title) && (
                            <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-gray-900">
                              {ev.production}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Production events (not personally assigned) */}
                {selectedEvents.filter(e => !e.isMine).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                      Pozostałe z moich produkcji
                    </p>
                    <div className="flex flex-col gap-2">
                      {selectedEvents.filter(e => !e.isMine).map(ev => (
                        <div key={ev.id} className="p-2.5 rounded-xl border border-gray-200 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-700">{ev.type ?? ev.title}</p>
                          <p className="text-[11px] mt-0.5 text-gray-500">
                            {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}
                            {ev.room ? ` · ${ev.room}` : ''}
                          </p>
                          {ev.production && ev.production !== (ev.type ?? ev.title) && (
                            <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-300 text-gray-600 bg-white">
                              {ev.production}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEvents.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Brak wydarzeń tego dnia.</p>
                )}

              </div>
            </>
          )
        })()}
        </div>
      </div>
      )}

      {/* ── Event drawer (szczegóły wydarzenia, z prawej) ── */}
      {selectedEvent && (
        <ActorEventDrawer ev={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

    </div>
  )
}
