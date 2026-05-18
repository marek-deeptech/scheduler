'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/language-context'
import EventModal from '@/components/EventModal'
import { useTheatre } from '@/lib/theatre-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamRecord { id: string; name: string }

interface ArtistRecord {
  id: string
  name: string
  teams: TeamRecord | null
}

interface EventRecord {
  id: string
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  production_id: string | null
  theatre_id: string | null
  room_id: string | null
  productions: { title: string } | null
  theatres: { name: string } | null
  rooms: { name: string } | null
  event_artists: { artist_id: string; artists: ArtistRecord }[]
}

interface AvailRecord {
  id: string
  artist_id: string
  start_time: string
  end_time: string
  type: string
  note: string | null
  artists: ArtistRecord
}

interface Theatre { id: string; name: string }
interface Room    { id: string; theatre_id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_STYLE: Record<string, { pill: string; dot: string }> = {
  Cast:      { pill: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
  Technique: { pill: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
  Wardrobe:  { pill: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
  default:   { pill: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
}

const THEATRE_STYLE: Record<string, { pill: string; dot: string; border: string }> = {
  'Teatr Polonia': { pill: 'bg-red-100 text-red-800',    dot: 'bg-red-500',    border: 'border-l-red-500'    },
  'Och-Teatr':     { pill: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-400', border: 'border-l-yellow-400' },
}

const AVAIL_STYLE: Record<string, { pill: string; icon: string }> = {
  vacation: { pill: 'bg-amber-100 text-amber-700', icon: '🌴' },
  sick:     { pill: 'bg-red-100 text-red-600',     icon: '🤒' },
  busy:     { pill: 'bg-gray-100 text-gray-600',   icon: '🚫' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(start.getDate() - offset)
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= last || days.length % 7 !== 0) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
    if (days.length > 42) break
  }
  return days
}

function expandToDays(start: string, end: string): string[] {
  const days: string[] = []
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number)
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number)
  const cur  = new Date(sy, sm - 1, sd)
  const stop = new Date(ey, em - 1, ed)
  while (cur <= stop) { days.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}

function dominantTeam(event: EventRecord): string {
  const names = event.event_artists.map(ea => ea.artists?.teams?.name).filter(Boolean) as string[]
  if (!names.length) return 'default'
  const counts: Record<string, number> = {}
  for (const n of names) counts[n] = (counts[n] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function eventStyle(event: EventRecord) {
  const theatreName = event.theatres?.name ?? ''
  if (THEATRE_STYLE[theatreName]) return { pill: THEATRE_STYLE[theatreName].pill, border: THEATRE_STYLE[theatreName].border }
  const team = dominantTeam(event)
  return { pill: (TEAM_STYLE[team] ?? TEAM_STYLE.default).pill, border: 'border-l-gray-400' }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EventPill({ event, isConflicting, onClick }: { event: EventRecord; isConflicting: boolean; onClick: () => void }) {
  const style = eventStyle(event)
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`w-full text-left rounded border-l-2 px-1.5 py-1 hover:opacity-80 transition-opacity ${style.pill} ${style.border}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold leading-tight truncate">{event.type ?? event.title}</span>
        {isConflicting && <span className="text-red-500 text-[10px] shrink-0 leading-tight">⚠</span>}
      </div>
      <div className="text-[9px] opacity-60 mt-0.5 leading-tight">
        {fmtTime(event.start_time)} – {fmtTime(event.end_time)}
      </div>
    </button>
  )
}

function DayCell({ date, isCurrentMonth, isToday, isSelected, dayData, conflictingIds, onClick, onEventClick }: {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  dayData: { events: EventRecord[]; vacations: AvailRecord[]; busy: AvailRecord[]; hasConflict: boolean } | undefined
  conflictingIds: Set<string>
  onClick: () => void
  onEventClick: (ev: EventRecord) => void
}) {
  const events    = dayData?.events    ?? []
  const vacations = dayData?.vacations ?? []
  const busy      = dayData?.busy      ?? []
  const conflict  = dayData?.hasConflict ?? false
  const extra     = Math.max(0, events.length - 2)

  return (
    <div
      onClick={onClick}
      className={[
        'relative flex flex-col gap-0.5 p-1.5 border-b border-r border-gray-100 cursor-pointer transition-colors min-h-[108px]',
        isCurrentMonth ? 'bg-white hover:bg-gray-50/80' : 'bg-gray-50/50',
        isSelected ? 'ring-2 ring-inset ring-gray-900' : '',
        conflict && isCurrentMonth ? '!bg-red-50/40' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className={[
          'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
          isToday ? 'bg-gray-900 text-white' : isCurrentMonth ? 'text-gray-800' : 'text-gray-300',
        ].join(' ')}>
          {date.getDate()}
        </span>
        <div className="flex gap-0.5">
          {conflict              && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {vacations.length > 0  && <span className="w-2 h-2 rounded-full bg-amber-400" />}
          {busy.length > 0       && <span className="w-2 h-2 rounded-full bg-gray-400" />}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 w-full">
        {events.slice(0, 2).map(ev => (
          <EventPill
            key={ev.id}
            event={ev}
            isConflicting={conflictingIds.has(ev.id)}
            onClick={() => onEventClick(ev)}
          />
        ))}
        {extra > 0 && <span className="text-[10px] text-gray-400 pl-1">+{extra}</span>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t, locale } = useLanguage()
  const { selectedTheatreId } = useTheatre()
  const tc  = t.calendar
  const now = new Date()

  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events,       setEvents]       = useState<EventRecord[]>([])
  const [availability, setAvailability] = useState<AvailRecord[]>([])
  const [artists,      setArtists]      = useState<ArtistRecord[]>([])
  const [productions,  setProductions]  = useState<{ id: string; title: string }[]>([])
  const [theatres,     setTheatres]     = useState<Theatre[]>([])
  const [rooms,        setRooms]        = useState<Room[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedDay,  setSelectedDay]  = useState<string | null>(toDateStr(now))
  const [filterTeam,   setFilterTeam]   = useState('all')

  // Modal
  const [modalEvent,   setModalEvent]   = useState<EventRecord | null | undefined>(undefined) // undefined = closed, null = create
  const [modalDate,    setModalDate]    = useState<string | undefined>(undefined)

  // Availability form
  const [showAvailForm, setShowAvailForm] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [availForm, setAvailForm] = useState({ artist_id: '', type: 'vacation', start_date: '', end_date: '', note: '' })

  useEffect(() => { fetchData() }, [year, month, selectedTheatreId])

  async function fetchData() {
    setLoading(true)
    const monthStart = new Date(year, month, 1).toISOString()
    const monthEnd   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    let eventsQuery = supabase.from('events')
      .select('*, productions(title), theatres(name), rooms(name), event_artists(artist_id, artists(id, name, teams(id, name)))')
      .lte('start_time', monthEnd).gte('end_time', monthStart)
      .order('start_time')
    if (selectedTheatreId) eventsQuery = eventsQuery.eq('theatre_id', selectedTheatreId)

    const [{ data: evData }, { data: avData }, { data: artData }, { data: prodData }, { data: thData }, { data: rmData }] = await Promise.all([
      eventsQuery,
      supabase.from('availability')
        .select('*, artists(id, name, teams(id, name))')
        .lte('start_time', monthEnd).gte('end_time', monthStart),
      supabase.from('artists').select('id, name, teams(id, name)').order('name'),
      supabase.from('productions').select('id, title').order('title'),
      supabase.from('theatres').select('*').order('name'),
      supabase.from('rooms').select('*').order('name'),
    ])

    setEvents((evData ?? []) as unknown as EventRecord[])
    setAvailability((avData ?? []) as unknown as AvailRecord[])
    setArtists((artData ?? []) as unknown as ArtistRecord[])
    setProductions(prodData ?? [])
    setTheatres(thData ?? [])
    setRooms(rmData ?? [])
    setLoading(false)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    if (filterTeam === 'all') return events
    return events.filter(e => e.event_artists.some(ea => ea.artists?.teams?.name === filterTeam))
  }, [events, filterTeam])

  const filteredAvail = useMemo(() => {
    if (filterTeam === 'all') return availability
    return availability.filter(a => a.artists?.teams?.name === filterTeam)
  }, [availability, filterTeam])

  // ── Calendar data ──────────────────────────────────────────────────────────

  const calendarData = useMemo(() => {
    const data: Record<string, { events: EventRecord[]; vacations: AvailRecord[]; busy: AvailRecord[]; hasConflict: boolean }> = {}
    const ensure = (d: string) => { if (!data[d]) data[d] = { events: [], vacations: [], busy: [], hasConflict: false } }

    for (const ev of filteredEvents)
      for (const d of expandToDays(ev.start_time, ev.end_time)) { ensure(d); data[d].events.push(ev) }

    for (const av of filteredAvail)
      for (const d of expandToDays(av.start_time, av.end_time)) {
        ensure(d)
        if (av.type === 'vacation' || av.type === 'sick') data[d].vacations.push(av)
        else data[d].busy.push(av)
      }

    for (const dayData of Object.values(data)) {
      const evs = dayData.events
      outer: for (let i = 0; i < evs.length; i++) {
        for (let j = i + 1; j < evs.length; j++) {
          const a = evs[i], b = evs[j]
          if (new Date(a.start_time) >= new Date(b.end_time) || new Date(b.start_time) >= new Date(a.end_time)) continue
          const aIds = a.event_artists.map(ea => ea.artist_id)
          const bIds = b.event_artists.map(ea => ea.artist_id)
          if (aIds.some(id => bIds.includes(id))) { dayData.hasConflict = true; break outer }
        }
      }
    }
    return data
  }, [filteredEvents, filteredAvail])

  const grid = useMemo(() => getMonthGrid(year, month), [year, month])

  const conflictingEventIds = useMemo(() => {
    const ids = new Set<string>()
    const evs = filteredEvents
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j]
        if (new Date(a.start_time) >= new Date(b.end_time) || new Date(b.start_time) >= new Date(a.end_time)) continue
        const aIds = a.event_artists.map(ea => ea.artist_id)
        const bIds = b.event_artists.map(ea => ea.artist_id)
        if (aIds.some(id => bIds.includes(id))) { ids.add(a.id); ids.add(b.id) }
      }
    }
    return ids
  }, [filteredEvents])

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(toDateStr(now)) }

  // ── Availability form ──────────────────────────────────────────────────────

  async function handleAddAvail(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('availability').insert({
      artist_id:  availForm.artist_id,
      type:       availForm.type,
      start_time: availForm.start_date + 'T00:00:00',
      end_time:   availForm.end_date   + 'T23:59:59',
      note:       availForm.note || null,
    })
    setAvailForm({ artist_id: '', type: 'vacation', start_date: '', end_date: '', note: '' })
    setShowAvailForm(false)
    setSaving(false)
    fetchData()
  }

  async function handleDeleteAvail(id: string) {
    if (!confirm(tc.confirmDeleteAvailability)) return
    await supabase.from('availability').delete().eq('id', id)
    fetchData()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const todayStr     = toDateStr(now)
  const selectedData = selectedDay ? calendarData[selectedDay] : null
  const localeStr    = locale === 'pl' ? 'pl-PL' : 'en-US'
  const monthLabel   = new Date(year, month).toLocaleDateString(localeStr, { month: 'long', year: 'numeric' })
  const teams        = ['Cast', 'Technique', 'Wardrobe']
  const inputCls     = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
  const labelCls     = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      {/* ── Event Modal ─────────────────────────────────────────────────────── */}
      {modalEvent !== undefined && (
        <EventModal
          event={modalEvent}
          defaultDate={modalDate}
          artists={artists}
          productions={productions}
          theatres={theatres}
          rooms={rooms}
          onClose={() => { setModalEvent(undefined); setModalDate(undefined) }}
          onSaved={() => { setModalEvent(undefined); setModalDate(undefined); fetchData() }}
        />
      )}

      <div className="flex gap-0 -m-8 h-[calc(100vh-0px)]">

        {/* ── Left: calendar ───────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 text-lg leading-none">‹</button>
              <h2 className="text-base font-bold text-gray-900 capitalize w-44 text-center">{monthLabel}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 text-lg leading-none">›</button>
              <button onClick={goToday} className="ml-1 px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                {tc.today}
              </button>
            </div>

            {/* Team filter */}
            <div className="flex gap-1">
              {[tc.all, ...teams].map((label, i) => {
                const val = i === 0 ? 'all' : teams[i - 1]
                const active = filterTeam === val
                const style = i === 0 ? '' : Object.values(TEAM_STYLE)[i - 1]?.pill ?? ''
                return (
                  <button key={val} onClick={() => setFilterTeam(val)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? i === 0 ? 'bg-gray-900 text-white border-gray-900' : style + ' border-transparent'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowAvailForm(v => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showAvailForm ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {showAvailForm ? tc.cancel : tc.addAvailability}
              </button>
              <button
                onClick={() => { setModalEvent(null); setModalDate(selectedDay ?? toDateStr(now)) }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {tc.addEvent}
              </button>
            </div>
          </div>

          {/* Availability form */}
          {showAvailForm && (
            <form onSubmit={handleAddAvail} className="px-6 py-4 border-b border-gray-200 bg-amber-50 shrink-0">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">{tc.newAvailability}</p>
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className={labelCls}>{tc.artist} *</label>
                  <select required value={availForm.artist_id} onChange={e => setAvailForm({...availForm, artist_id: e.target.value})} className={inputCls}>
                    <option value="">{tc.selectArtist}</option>
                    {artists.map(a => <option key={a.id} value={a.id}>{a.name}{a.teams ? ` (${a.teams.name})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tc.type}</label>
                  <select value={availForm.type} onChange={e => setAvailForm({...availForm, type: e.target.value})} className={inputCls}>
                    <option value="vacation">{tc.types.vacation}</option>
                    <option value="busy">{tc.types.busy}</option>
                    <option value="sick">{tc.types.sick}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tc.startDate} *</label>
                  <input required type="date" value={availForm.start_date} onChange={e => setAvailForm({...availForm, start_date: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{tc.endDate} *</label>
                  <input required type="date" value={availForm.end_date} onChange={e => setAvailForm({...availForm, end_date: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{tc.note}</label>
                  <input value={availForm.note} onChange={e => setAvailForm({...availForm, note: e.target.value})} className={inputCls} placeholder={tc.notePlaceholder} />
                </div>
              </div>
              <button type="submit" disabled={saving} className="mt-3 px-4 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saving ? tc.saving : tc.save}
              </button>
            </form>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-amber-50 shrink-0">
            {tc.weekdays.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2 border-r border-gray-100 last:border-r-0">{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Ładowanie...</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-7 border-l border-gray-100">
                {grid.map((date, i) => {
                  const dateStr = toDateStr(date)
                  return (
                    <DayCell
                      key={i}
                      date={date}
                      isCurrentMonth={date.getMonth() === month}
                      isToday={dateStr === todayStr}
                      isSelected={dateStr === selectedDay}
                      dayData={calendarData[dateStr]}
                      conflictingIds={conflictingEventIds}
                      onClick={() => setSelectedDay(selectedDay === dateStr ? null : dateStr)}
                      onEventClick={ev => setModalEvent(ev)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 px-6 py-2 border-t border-gray-100 bg-white shrink-0 text-[10px] text-gray-400 flex-wrap">
            {Object.entries(THEATRE_STYLE).map(([name, s]) => (
              <span key={name} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{name}</span>
            ))}
            <span className="w-px h-3 bg-gray-200 mx-1" />
            {Object.entries(TEAM_STYLE).filter(([k]) => k !== 'default').map(([name, s]) => (
              <span key={name} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{name}</span>
            ))}
            <span className="w-px h-3 bg-gray-200 mx-1" />
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{tc.vacation}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />⚠ {tc.conflict}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />{tc.busy}</span>
          </div>
        </div>

        {/* ── Right: day detail panel ──────────────────────────────────────── */}
        <div className={`flex flex-col border-l border-gray-200 bg-white shrink-0 transition-all duration-200 overflow-hidden ${selectedDay ? 'w-72' : 'w-0'}`}>
          {selectedDay && (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="font-semibold text-gray-900 text-sm capitalize">
                    {new Date(selectedDay + 'T12:00:00').toLocaleDateString(localeStr, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {selectedData?.hasConflict && <span className="text-xs font-medium text-red-500">⚠ {tc.conflict}</span>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setModalEvent(null); setModalDate(selectedDay) }}
                    className="text-xs px-2 py-1 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    + {tc.addEvent.replace('+ ', '')}
                  </button>
                  <button onClick={() => setSelectedDay(null)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg leading-none">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
                {/* Events */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{tc.events}</p>
                  {!selectedData?.events.length ? (
                    <p className="text-xs text-gray-400">{tc.noEvents}</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedData.events.map(ev => {
                        const team  = dominantTeam(ev)
                        const style = TEAM_STYLE[team] ?? TEAM_STYLE.default
                        return (
                          <button
                            key={ev.id}
                            onClick={() => setModalEvent(ev)}
                            className={`w-full text-left rounded-xl p-3 ${style.pill} hover:opacity-80 transition-opacity`}
                          >
                            <p className="text-xs font-semibold">{ev.type ?? ev.title}</p>
                            {ev.type && ev.title !== ev.type && <p className="text-[10px] opacity-60 mt-0.5">{ev.title}</p>}
                            <p className="text-[10px] opacity-70 mt-0.5">
                              {new Date(ev.start_time).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}
                              {' – '}
                              {new Date(ev.end_time).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}
                              {ev.rooms && ` · ${ev.rooms.name}`}
                            </p>
                            {ev.productions && <p className="text-[10px] opacity-60 mt-0.5">🎭 {ev.productions.title}</p>}
                            {ev.event_artists.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {ev.event_artists.map(ea => (
                                  <span key={ea.artist_id} className="text-[10px] bg-white/60 rounded-full px-1.5 py-0.5 font-medium">
                                    {ea.artists?.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="text-[9px] opacity-40 mt-1.5">Kliknij, aby edytować</p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Availability */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{tc.availability}</p>
                  {!selectedData?.vacations.length && !selectedData?.busy.length ? (
                    <p className="text-xs text-gray-400">{tc.noAvailability}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {[...(selectedData?.vacations ?? []), ...(selectedData?.busy ?? [])].map(av => {
                        const s = AVAIL_STYLE[av.type] ?? AVAIL_STYLE.busy
                        const label = av.type === 'vacation' ? tc.vacation : av.type === 'sick' ? tc.sick : tc.busy
                        return (
                          <div key={av.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${s.pill}`}>
                            <div>
                              <p className="text-xs font-medium">{s.icon} {av.artists?.name}</p>
                              <p className="text-[10px] opacity-70">{label}{av.note ? ` · ${av.note}` : ''}</p>
                            </div>
                            <button onClick={() => handleDeleteAvail(av.id)} className="text-[10px] opacity-40 hover:opacity-100">✕</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
