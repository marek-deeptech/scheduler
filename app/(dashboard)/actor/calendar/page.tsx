'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'

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
  isMine: boolean   // true = actor in event_artists; false = production event only
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
  { value: 'Choroba',                    cls: 'bg-gray-900 text-white',         dot: 'bg-gray-700',    icon: '✗' },
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
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActorCalendarPage() {
  const { actorId, actorName } = useProfile()
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

    // All events this month belonging to the actor's productions
    let evList: DayEvent[] = []
    if (productionIds.length > 0) {
      const { data: evData } = await supabase
        .from('events')
        .select('id, title, type, start_time, end_time, rooms(name), productions(id, title)')
        .in('production_id', productionIds)
        .gte('start_time', `${rangeStart}T00:00:00`)
        .lt('start_time',  `${rangeEnd}T00:00:00`)
        .order('start_time')

      evList = ((evData ?? []) as any[]).map(e => {
        const rm   = Array.isArray(e.rooms)      ? e.rooms[0]      : e.rooms
        const prod = Array.isArray(e.productions) ? e.productions[0]: e.productions
        return {
          id: e.id, title: e.title, type: e.type,
          start_time: e.start_time, end_time: e.end_time,
          production_id: prod?.id ?? null,
          production: prod?.title ?? null,
          room: rm?.name ?? null,
          isMine: myEventIds.has(e.id),
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

  // Multi-select: save immediately with delete → insert
  async function applyStatusToSelected(status: string) {
    if (!actorId || multiSelected.size === 0) return
    setSaving(true)
    setSaveError(null)
    const dates = Array.from(multiSelected)

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
    } else {
      setSaveError('Błąd zapisu: ' + insErr.message)
    }
    setSaving(false)
    exitMultiMode()
  }

  function getEventsForDate(dateStr: string): DayEvent[] {
    return events.filter(e => e.start_time.slice(0, 10) === dateStr)
  }

  // Mark a day's status locally (not saved yet)
  function markDayStatus(dateStr: string, status: string) {
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
    const toSave: { date: string; status: string; note: string | null }[] = []

    const pendingEntries = Object.entries(pending)
    for (const [date, status] of pendingEntries) {
      const isSelected = date === selected
      toSave.push({
        date,
        status,
        note: isSelected ? (noteInput || null) : (getStatusForDate(date)?.note ?? null),
      })
    }

    // If selected day has no pending status change but has a note change, add it too
    if (selected && !pending[selected]) {
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
    <div className="flex gap-6 h-full -m-8">

      {/* ── Left: calendar ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Mój Kalendarz</h1>
              <p className="text-xs text-gray-500 mt-0.5">{actorName}</p>
            </div>
            <div className="flex items-center gap-2">
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
              <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">‹</button>
              <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">
                {MONTHS_PL[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">›</button>
            </div>
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

        {/* Unsaved changes banner */}
        {(Object.keys(pending).length > 0 && !selected) && (
          <div className="px-8 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
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
          <div className="px-8 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-red-600 font-medium">{saveError}</span>
            <button onClick={() => setSaveError(null)} className="text-xs text-red-400 hover:text-red-600 ml-3">✕</button>
          </div>
        )}

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Ładowanie…</div>
          ) : (
            <>
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS_PL.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider py-1">{d}</div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />
                  const dateStr  = toDateStr(day)
                  const isToday  = dateStr === todayStr
                  const isSel      = !multiMode && dateStr === selected
                  const isMultiSel = multiMode && multiSelected.has(dateStr)
                  const dayEvs     = getEventsForDate(dateStr)
                  const daySt      = effectiveStatus(dateStr)
                  const isPending  = pending[dateStr] !== undefined
                  const stDef      = DAY_STATUSES.find(s => s.value === daySt?.status)
                  const isBlocking = daySt && BLOCKING_STATUSES.has(daySt.status)
                  const hasConflict = isBlocking && dayEvs.length > 0

                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        if (multiMode) {
                          toggleMultiDate(dateStr)
                        } else {
                          setSelected(isSel ? null : dateStr)
                          setNoteInput(getStatusForDate(dateStr)?.note ?? '')
                        }
                      }}
                      className={`relative p-1.5 rounded-xl border text-left transition-all min-h-[72px] flex flex-col ${
                        isMultiSel
                          ? 'border-gray-900 ring-2 ring-gray-900 bg-gray-50'
                          : isSel
                          ? 'border-gray-900 ring-1 ring-gray-900 bg-white'
                          : hasConflict
                          ? 'border-orange-300 bg-orange-50 hover:border-orange-400'
                          : 'border-gray-100 hover:border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {/* Multi-select checkmark */}
                      {multiMode && (
                        <span className={`absolute top-1 right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-colors ${
                          isMultiSel
                            ? 'bg-gray-900 border-gray-900 text-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isMultiSel ? '✓' : ''}
                        </span>
                      )}

                      {/* Conflict badge */}
                      {hasConflict && !multiMode && (
                        <span className="absolute top-1 right-1 text-[10px]">⚠️</span>
                      )}

                      {/* Date number */}
                      <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
                        isToday ? 'bg-gray-900 text-white' : 'text-gray-700'
                      }`}>
                        {day.getDate()}
                      </span>

                      {/* Status dot */}
                      {daySt && (
                        <span className={`w-full text-[9px] font-bold px-1 py-0.5 rounded-md text-center mb-0.5 ${stDef?.cls ?? 'bg-gray-100 text-gray-600'} ${isPending ? 'opacity-60' : ''}`}>
                          {isPending && '● '}{DAY_STATUSES.find(s => s.value === daySt.status)?.icon ?? '?'}
                        </span>
                      )}

                      {/* Events */}
                      <div className="flex flex-col gap-0.5 mt-auto w-full">
                        {dayEvs.slice(0, 2).map(ev => (
                          <span key={ev.id} className={`text-[9px] rounded px-1 truncate font-medium border ${
                            ev.isMine
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-gray-300'
                          }`}>
                            {fmtTime(ev.start_time)} {ev.type ?? ev.title}
                          </span>
                        ))}
                        {dayEvs.length > 2 && (
                          <span className="text-[9px] text-gray-400">+{dayEvs.length - 2}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Right: day detail panel ───────────────────────────────────────── */}
      <div className={`shrink-0 w-72 border-l border-gray-200 bg-white transition-all duration-200 overflow-hidden flex flex-col ${selected || multiMode ? '' : 'hidden'}`}>

        {/* ── Multi-select panel ── */}
        {multiMode && (
          <>
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  {multiSelected.size > 0 ? `${multiSelected.size} ${multiSelected.size === 1 ? 'dzień' : 'dni'}` : 'Zaznacz dni'}
                </h3>
                <button onClick={exitMultiMode} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">×</button>
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
          const dayLabel = `${DAYS_PL[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_PL[d.getMonth()]}`
          const daySt    = effectiveStatus(selected)
          const hasPendingChanges = Object.keys(pending).length > 0

          return (
            <>
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">{dayLabel}</h3>
                  <button onClick={() => setSelected(null)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* Status picker */}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Mój status na ten dzień</p>
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
                </div>

                {/* Note */}
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
                          {ev.production && (
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
                          {ev.production && (
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
  )
}
