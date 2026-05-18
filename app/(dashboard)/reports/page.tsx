'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REHEARSAL_TYPES = new Set([
  'Próba stolikowa','Próba sytuacyjna','Próba techniczna','Próba muzyczna',
  'Próba choreograficzna','Próba kostiumowa','Próba generalna','Próba z publicznością',
])
const SHOW_TYPES    = new Set(['Premiera','Spektakl','Spektakl gościnny'])
const FITTING_TYPES = new Set(['Przymiarki kostiumowe'])

const PERIOD_OPTIONS = [
  { value: 'week',  label: 'tydzień'  },
  { value: 'month', label: 'miesiąc'  },
  { value: 'year',  label: 'rok'      },
]

const COLORS = ['#3b82f6','#dc2626','#d97706','#16a34a','#7c3aed','#0891b2','#db2777']

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
  const [period,  setPeriod]  = useState('week')
  const [events,  setEvents]  = useState<EventRow[]>([])
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [avails,  setAvails]  = useState<AvailRow[]>([])
  const [loading, setLoading] = useState(true)

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

    const [{ data: evData }, { data: artData }, { data: avData }] = await Promise.all([
      evQ,
      supabase.from('artists').select('id,name,status').order('name'),
      supabase.from('availabilities').select('artist_id,type')
        .lte('start_time', `${end}T23:59:59`)
        .gte('end_time',   `${start}T00:00:00`),
    ])

    setEvents((evData ?? []) as unknown as EventRow[])
    setArtists((artData ?? []) as ArtistRow[])
    setAvails(avData ?? [])
    setLoading(false)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const rehearsals = events.filter(e => REHEARSAL_TYPES.has(e.type ?? ''))
    const shows      = events.filter(e => SHOW_TYPES.has(e.type ?? ''))
    const fittings   = events.filter(e => FITTING_TYPES.has(e.type ?? ''))
    const rehearsalH = rehearsals.reduce((s, e) => s + hours(e.start_time, e.end_time), 0)
    let conflicts = 0
    for (let i = 0; i < events.length; i++)
      for (let j = i+1; j < events.length; j++) {
        const a = events[i], b = events[j]
        if (new Date(a.start_time) >= new Date(b.end_time)) continue
        if (new Date(b.start_time) >= new Date(a.end_time)) continue
        const aIds = new Set(a.event_artists.map(x => x.artist_id))
        if (b.event_artists.some(x => aIds.has(x.artist_id))) conflicts++
      }
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
      { name: 'Dostępni',        value: available,   fill: '#16a34a' },
      { name: 'Urlop',           value: urlop,        fill: '#d97706' },
      { name: 'Niedyspozycyjni', value: niedostepni,  fill: '#dc2626' },
    ].filter(s => s.value > 0)
  }, [artists, avails])

  const perProduction = useMemo(() => {
    const map: Record<string, { title: string; count: number }> = {}
    for (const ev of events) {
      if (!REHEARSAL_TYPES.has(ev.type ?? '')) continue
      const key = ev.production_id ?? '__none__'
      if (!map[key]) map[key] = { title: ev.productions?.title ?? 'Bez produkcji', count: 0 }
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
    if (!selectedTheatreId) return 'Wszystkie teatry'
    return events.find(e => e.theatres?.name)?.theatres?.name ?? 'Teatr'
  }, [events, selectedTheatreId])

  const generatedStr = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })

  const statCards = [
    { label: 'Próby łącznie',     value: stats.rehearsals             },
    { label: 'Spektakle',         value: stats.shows                  },
    { label: 'Godziny prób',      value: Math.round(stats.rehearsalH) },
    { label: 'Konflikty grafiku', value: stats.conflicts              },
    { label: 'Przymiarki oczek.', value: stats.fittings               },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Raport koordynatora pracy artystycznej</h2>
          <p className="text-sm text-gray-400 mt-1">{theatreName} · Wygenerowano: {generatedStr}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 text-gray-700"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-5-5 1.4-1.4 2.6 2.6V4h2v8.2l2.6-2.6L17 11l-5 5zm-7 4v-4h2v2h10v-2h2v4H5z"/>
            </svg>
            Eksportuj PDF
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-4">
        {loading
          ? [...Array(5)].map((_, i) => <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 h-28 animate-pulse" />)
          : statCards.map(s => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-2xl px-5 py-6 text-center">
                <p className="text-xs font-medium text-gray-400 mb-3 leading-tight">{s.label}</p>
                <p className="text-4xl font-bold leading-none text-gray-700">{s.value}</p>
              </div>
            ))
        }
      </div>

      {/* Charts row 1: workload + status */}
      <div className="grid grid-cols-5 gap-4">

        {/* Artist workload */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Obciążenie artystów — liczba prób</h3>
          {loading || artistWorkload.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-400 italic">
              {loading ? 'Ładowanie…' : 'Brak danych w tym okresie'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, artistWorkload.length * 34)}>
              <BarChart data={artistWorkload} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={68} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                <Bar dataKey="rehearsals" name="Próby"     fill={COLORS[0]} radius={[0,3,3,0]} barSize={8} />
                <Bar dataKey="shows"      name="Spektakle" fill={COLORS[1]} radius={[0,3,3,0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Artist status donut */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Status artystów</h3>
          {loading || artistStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-400 italic">
              {loading ? 'Ładowanie…' : 'Brak danych'}
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
                      <p className="text-xs text-gray-400 mt-0.5">{s.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2: per-production + room util */}
      <div className="grid grid-cols-2 gap-4">

        {/* Rehearsals per production */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Próby per produkcja</h3>
          {loading || perProduction.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-xs text-gray-400 italic">
              {loading ? 'Ładowanie…' : 'Brak prób w tym okresie'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perProduction} margin={{ left: 4, right: 4, top: 4, bottom: 44 }}>
                <XAxis dataKey="title" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                  angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="count" name="Próby" radius={[4,4,0,0]} barSize={36}>
                  {perProduction.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Room utilization */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Wykorzystanie sal (godz.)</h3>
          {loading || roomUtil.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-xs text-gray-400 italic">
              {loading ? 'Ładowanie…' : 'Brak sal przypisanych do wydarzeń'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={roomUtil} layout="vertical" margin={{ left: 0, right: 28, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={84} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="hours" name="Godziny" radius={[0,4,4,0]} barSize={20}>
                  {roomUtil.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Event type breakdown */}
      {!loading && typeCounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Rozkład typów wydarzeń</h3>
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
