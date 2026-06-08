'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

interface EventRow {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  rooms: { name: string } | null
  event_artists: { artists: { id: string; name: string } | null }[]
}

interface EventType { id: string; name: string }

// ── colour helpers ────────────────────────────────────────────────────────────

const TYPE_COLOURS: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  'Sesja':               { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
  'Próba chóru':         { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4', dot: '#a89e92' },
  'Wynajem przestrzeni': { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4', dot: '#14b8a6' },
  'Konferencja':         { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', dot: '#a855f7' },
  'Urodziny':            { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8', dot: '#ec4899' },
  'Inne':                { bg: '#f9fafb', color: '#4b5563', border: '#e5e7eb', dot: '#9ca3af' },
  'Spektakl':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd', dot: '#c8102e' },
  'Premiera':            { bg: '#fdf0f2', color: '#9e0c24', border: '#f5c6cd', dot: '#c8102e' },
  'Próba':               { bg: '#f2ede6', color: '#5a524a', border: '#e4ddd4', dot: '#a89e92' },
  'Przymiarki':          { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', dot: '#22c55e' },
}
const EXTRA_PALETTES = [
  { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', dot: '#f97316' },
  { bg: '#fefce8', color: '#a16207', border: '#fef08a', dot: '#eab308' },
  { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd', dot: '#0ea5e9' },
  { bg: '#f7fee7', color: '#3f6212', border: '#d9f99d', dot: '#84cc16' },
]

function typeStyle(type: string | null, extraIndex = 0) {
  if (!type) return { bg: '#f2ede6', color: '#7a7068', border: '#e4ddd4', dot: '#cec5b8' }
  if (TYPE_COLOURS[type]) return TYPE_COLOURS[type]
  const prefix = Object.keys(TYPE_COLOURS).find(k => type.startsWith(k))
  if (prefix) return TYPE_COLOURS[prefix]
  return EXTRA_PALETTES[extraIndex % EXTRA_PALETTES.length]
}

// ── date helpers ──────────────────────────────────────────────────────────────

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                   'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd']

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dayKey(iso: string) { return iso.slice(0, 10) }

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

function formatDayLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Build calendar grid: Mon-first, null = padding cell
function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = (first.getDay() + 6) % 7   // Mon=0 … Sun=6
  const days: (Date | null)[] = Array(start).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  // pad to complete last week
  while (days.length % 7 !== 0) days.push(null)
  return days
}

// ── event card ────────────────────────────────────────────────────────────────

function EventCard({ ev, extraIdx, now }: { ev: EventRow; extraIdx: number; now: Date }) {
  const style   = typeStyle(ev.type, extraIdx)
  const actors  = (ev.event_artists ?? []).map((ea: any) => ea.artists?.name).filter(Boolean) as string[]
  const room    = ev.rooms?.name ?? ev.location ?? null
  const isPast  = new Date(ev.end_time) < now
  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
      style={{ background: '#fff', border: '1px solid #e4ddd4', opacity: isPast ? 0.6 : 1 }}
    >
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="shrink-0 text-right w-16">
          <p className="text-sm font-semibold" style={{ color: '#1a1410' }}>{formatTime(ev.start_time)}</p>
          <p className="text-[11px]" style={{ color: '#a89e92' }}>{formatTime(ev.end_time)}</p>
        </div>
        <div className="w-px self-stretch" style={{ background: '#f2ede6' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#1a1410' }}>
                {ev.title || '(bez tytułu)'}
              </p>
              {room && (
                <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#7a7068' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
                  </svg>
                  {room}
                </p>
              )}
            </div>
            {ev.type && (
              <span className="shrink-0 text-[11px] font-medium px-2.5 py-0.5 rounded-full border"
                style={{ background: style.bg, color: style.color, borderColor: style.border }}>
                {ev.type}
              </span>
            )}
          </div>
          {actors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {actors.map(name => (
                <span key={name} className="text-[11px] px-2 py-0.5 rounded-lg"
                  style={{ background: '#f2ede6', color: '#5a524a' }}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events,      setEvents]      = useState<EventRow[]>([])
  const [eventTypes,  setEventTypes]  = useState<EventType[]>([])
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState<'list' | 'calendar'>('calendar')
  const [period,      setPeriod]      = useState<'upcoming' | 'all' | 'past'>('upcoming')
  const [typeFilter,  setTypeFilter]  = useState('Wszystkie')
  const [calMonth,    setCalMonth]    = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: evData }, { data: typesData }] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, start_time, end_time, location, rooms(name), event_artists(artists(id, name))')
        .is('production_id', null)
        .order('start_time', { ascending: true }),
      supabase.from('event_types').select('id, name').order('name'),
    ])
    setEvents((evData ?? []) as any[])
    setEventTypes(typesData ?? [])
    setLoading(false)
  }

  const now = new Date()
  const todayStr = localDate(now)

  const extraIndexMap = useMemo(() => {
    const map = new Map<string, number>(); let idx = 0
    for (const t of eventTypes)
      if (!TYPE_COLOURS[t.name] && !Object.keys(TYPE_COLOURS).some(k => t.name.startsWith(k)))
        map.set(t.name, idx++)
    return map
  }, [eventTypes])

  const filterOptions = useMemo(() => ['Wszystkie', ...eventTypes.map(t => t.name)], [eventTypes])

  // events after type filter (used by both views)
  const typeFiltered = useMemo(() => {
    if (typeFilter === 'Wszystkie') return events
    return events.filter(e => e.type === typeFilter)
  }, [events, typeFilter])

  // ── LIST view data ────────────────────────────────────────────────────────

  const listFiltered = useMemo(() => {
    let list = typeFiltered
    if (period === 'upcoming') list = list.filter(e => new Date(e.end_time) >= now)
    if (period === 'past')     list = list.filter(e => new Date(e.end_time) < now)
    return list
  }, [typeFiltered, period])

  const listGrouped = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of listFiltered) {
      const k = dayKey(e.start_time)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [listFiltered])

  // ── CALENDAR view data ────────────────────────────────────────────────────

  const calYear  = calMonth.getFullYear()
  const calMon   = calMonth.getMonth()
  const grid     = useMemo(() => buildGrid(calYear, calMon), [calYear, calMon])

  // Map day → events for the displayed month (type-filtered)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of typeFiltered) {
      const k = dayKey(e.start_time)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return map
  }, [typeFiltered])

  // Events shown below calendar: selected day or all month events
  const calListEvents = useMemo(() => {
    if (selectedDay) return eventsByDay.get(selectedDay) ?? []
    // all events in this month, sorted
    const prefix = `${String(calYear)}-${String(calMon + 1).padStart(2, '0')}`
    const result: EventRow[] = []
    for (const [k, evs] of eventsByDay) if (k.startsWith(prefix)) result.push(...evs)
    return result.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [eventsByDay, selectedDay, calYear, calMon])

  function prevMonth() {
    setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    setSelectedDay(null)
  }
  function goToday() {
    setCalMonth(new Date())
    setSelectedDay(todayStr)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="-m-8 flex flex-col min-h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-8 py-5 bg-white shrink-0" style={{ borderBottom: '1px solid #e4ddd4' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
              Wydarzenia
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#a89e92' }}>Zdarzenia niepowiązane z żadnym tytułem</p>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
              {([['calendar','Kalendarz'],['list','Lista']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setView(v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                  style={view === v
                    ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                    : { color: '#7a7068' }}>
                  {v === 'calendar'
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                  }
                  {label}
                </button>
              ))}
            </div>

            {/* Period toggle — list only */}
            {view === 'list' && (
              <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: '#f2ede6' }}>
                {(['upcoming','all','past'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={period === p
                      ? { background: '#fff', color: '#1a1410', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                      : { color: '#7a7068' }}>
                    {p === 'upcoming' ? 'Nadchodzące' : p === 'all' ? 'Wszystkie' : 'Archiwalne'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {filterOptions.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-1 text-xs font-medium rounded-full border transition-all"
              style={typeFilter === t
                ? { background: '#1a1410', color: '#fff', borderColor: '#1a1410' }
                : { background: '#faf8f5', color: '#7a7068', borderColor: '#e4ddd4' }}>
              {t}
            </button>
          ))}
          {!loading && eventTypes.length === 0 && (
            <span className="text-xs italic" style={{ color: '#a89e92' }}>
              Dodaj typy w Ustawienia → Typy Wydarzeń
            </span>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f2ede6' }}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#a89e92' }}>
            Ładowanie wydarzeń…
          </div>

        ) : view === 'calendar' ? (
          /* ═══ CALENDAR VIEW ═══════════════════════════════════════════ */
          <div className="px-8 py-6 space-y-5 max-w-3xl">

            {/* Calendar card */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e4ddd4' }}>

              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f2ede6' }}>
                <button onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100"
                  style={{ color: '#7a7068' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>

                <div className="flex items-center gap-3">
                  <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1a1410' }}>
                    {MONTHS_PL[calMon]}
                  </h2>
                  <span className="text-sm font-medium" style={{ color: '#a89e92' }}>{calYear}</span>
                  <button onClick={goToday}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                    style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                    onMouseOver={e => (e.currentTarget.style.background = '#e4ddd4')}
                    onMouseOut={e => (e.currentTarget.style.background = '#f2ede6')}>
                    Dziś
                  </button>
                </div>

                <button onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-gray-100"
                  style={{ color: '#7a7068' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                {DAYS_SHORT.map(d => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: d === 'Sb' || d === 'Nd' ? '#cec5b8' : '#a89e92' }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px px-3 pb-4">
                {grid.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} />
                  const dStr    = localDate(day)
                  const dayEvs  = (eventsByDay.get(dStr) ?? [])
                  const isToday = dStr === todayStr
                  const isSel   = dStr === selectedDay
                  const isSbSn  = day.getDay() === 0 || day.getDay() === 6

                  return (
                    <button
                      key={dStr}
                      onClick={() => setSelectedDay(prev => prev === dStr ? null : dStr)}
                      className="flex flex-col items-center py-1.5 rounded-xl transition-all"
                      style={{
                        background: isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent',
                        border: isToday && !isSel ? '1px solid #e4ddd4' : '1px solid transparent',
                      }}
                      onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#f8f5f1' }}
                      onMouseOut={e => { e.currentTarget.style.background = isSel ? '#1a1410' : isToday ? '#f2ede6' : 'transparent' }}
                    >
                      <span className="text-sm font-medium w-7 h-7 flex items-center justify-center rounded-lg"
                        style={{ color: isSel ? '#fff' : isToday ? '#1a1410' : isSbSn ? '#cec5b8' : '#3e3830' }}>
                        {day.getDate()}
                      </span>

                      {/* Event dots — up to 3 */}
                      {dayEvs.length > 0 && (
                        <div className="flex gap-0.5 mt-1 h-1.5">
                          {dayEvs.slice(0, 3).map((e, di) => {
                            const s = typeStyle(e.type, extraIndexMap.get(e.type ?? '') ?? 0)
                            return (
                              <span key={di} className="w-1.5 h-1.5 rounded-full"
                                style={{ background: isSel ? 'rgba(255,255,255,0.7)' : s.dot }} />
                            )
                          })}
                          {dayEvs.length > 3 && (
                            <span className="text-[8px] leading-none" style={{ color: isSel ? 'rgba(255,255,255,0.7)' : '#a89e92' }}>+</span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Month summary */}
              {(() => {
                const prefix = `${calYear}-${String(calMon + 1).padStart(2, '0')}`
                const total  = [...eventsByDay.entries()].filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v.length, 0)
                return total > 0 ? (
                  <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid #f2ede6' }}>
                    <span className="text-xs" style={{ color: '#a89e92' }}>
                      {total} wydarzeń w miesiącu
                    </span>
                    {selectedDay && (
                      <button onClick={() => setSelectedDay(null)}
                        className="text-xs underline decoration-dotted underline-offset-2"
                        style={{ color: '#7a7068' }}>
                        Pokaż wszystkie
                      </button>
                    )}
                  </div>
                ) : null
              })()}
            </div>

            {/* Events below calendar */}
            {calListEvents.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm" style={{ color: '#a89e92' }}>
                  {selectedDay ? 'Brak wydarzeń tego dnia' : 'Brak wydarzeń w tym miesiącu'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group by day */}
                {(() => {
                  const byDay = new Map<string, EventRow[]>()
                  for (const e of calListEvents) {
                    const k = dayKey(e.start_time)
                    if (!byDay.has(k)) byDay.set(k, [])
                    byDay.get(k)!.push(e)
                  }
                  return Array.from(byDay.entries()).map(([dk, dayEvs]) => (
                    <div key={dk}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>
                          {formatDayLabel(dayEvs[0].start_time)}
                        </p>
                        <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>
                          {dayEvs.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {dayEvs.map(ev => (
                          <EventCard key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} />
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

        ) : (
          /* ═══ LIST VIEW ════════════════════════════════════════════════ */
          <div className="px-8 py-6">
            {listGrouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#e4ddd4' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7a7068" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: '#5a524a' }}>
                  {period === 'upcoming' ? 'Brak nadchodzących wydarzeń' : period === 'past' ? 'Brak archiwalnych wydarzeń' : 'Brak wydarzeń'}
                </p>
              </div>
            ) : (
              <div className="space-y-8 max-w-3xl">
                {listGrouped.map(([dk, dayEvs]) => (
                  <div key={dk}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: '#7a7068' }}>
                        {formatDayLabel(dayEvs[0].start_time)}
                      </p>
                      <div className="flex-1 h-px" style={{ background: '#e4ddd4' }} />
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#e4ddd4', color: '#7a7068' }}>
                        {dayEvs.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dayEvs.map(ev => (
                        <EventCard key={ev.id} ev={ev} extraIdx={extraIndexMap.get(ev.type ?? '') ?? 0} now={now} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
