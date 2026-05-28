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
  const [eventsM1,    setEventsM1]    = useState<EventRow[]>([])
  const [eventsM2,    setEventsM2]    = useState<EventRow[]>([])
  const [workloadSort, setWorkloadSort] = useState<'hours' | 'absence'>('hours')

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

    // Previous 2 months for hours columns
    const now2 = new Date()
    const m1Start = new Date(now2.getFullYear(), now2.getMonth() - 1, 1)
    const m1End   = new Date(now2.getFullYear(), now2.getMonth(),     0)
    const m2Start = new Date(now2.getFullYear(), now2.getMonth() - 2, 1)
    const m2End   = new Date(now2.getFullYear(), now2.getMonth() - 1, 0)

    const histSel = 'id,type,start_time,end_time,theatre_id,event_artists(artist_id)'
    let histM1Q = supabase.from('events').select(histSel)
      .gte('start_time', `${localDate(m1Start)}T00:00:00`)
      .lte('start_time', `${localDate(m1End)}T23:59:59`)
    let histM2Q = supabase.from('events').select(histSel)
      .gte('start_time', `${localDate(m2Start)}T00:00:00`)
      .lte('start_time', `${localDate(m2End)}T23:59:59`)
    if (selectedTheatreId) {
      histM1Q = histM1Q.eq('theatre_id', selectedTheatreId)
      histM2Q = histM2Q.eq('theatre_id', selectedTheatreId)
    }

    const [
      { data: evData },
      { data: artData },
      { data: avData },
      { data: prodData },
      { data: histM1Data },
      { data: histM2Data },
    ] = await Promise.all([
      evQ,
      supabase.from('artists').select('id,name,status').order('name'),
      supabase.from('availabilities').select('artist_id,type,start_time,end_time')
        .lte('start_time', `${end}T23:59:59`)
        .gte('end_time',   `${start}T00:00:00`),
      prodQ,
      histM1Q,
      histM2Q,
    ])

    setEvents((evData ?? []) as unknown as EventRow[])
    setArtists((artData ?? []) as ArtistRow[])
    setAvails(avData ?? [])
    setEventsM1((histM1Data ?? []) as unknown as EventRow[])
    setEventsM2((histM2Data ?? []) as unknown as EventRow[])
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
      .filter(p => p.status !== 'Zdjęty') // exclude archived
      .sort((a, b) => (b.rehearsals + b.shows) - (a.rehearsals + a.shows))
  }, [events, productions, today])

  const artistTable = useMemo(() => {
    const { start, end } = periodRange(period)
    const map: Record<string, { id: string; name: string; status: string | null; eventCount: number; prodIds: Set<string>; absenceDays: number }> = {}

    for (const a of artists) {
      map[a.id] = { id: a.id, name: a.name, status: a.status, eventCount: 0, prodIds: new Set(), absenceDays: 0 }
    }
    for (const ev of events) {
      for (const ea of ev.event_artists) {
        if (!map[ea.artist_id]) continue
        map[ea.artist_id].eventCount++
        if (ev.production_id) map[ea.artist_id].prodIds.add(ev.production_id)
      }
    }

    const periodStart = new Date(start).getTime()
    const periodEnd   = new Date(end).getTime() + 86400000

    for (const av of avails) {
      if (!map[av.artist_id]) continue
      const s = Math.max(new Date(av.start_time).getTime(), periodStart)
      const e = Math.min(new Date(av.end_time).getTime(),   periodEnd)
      const days = Math.max(0, Math.round((e - s) / 86400000))
      map[av.artist_id].absenceDays += days
    }

    // Hours per artist for months -1 and -2
    const hoursM1: Record<string, number> = {}
    const hoursM2: Record<string, number> = {}
    for (const ev of eventsM1.filter(e => SHOW_TYPES.has(e.type ?? ''))) {
      const h = hours(ev.start_time, ev.end_time)
      for (const ea of ev.event_artists) {
        hoursM1[ea.artist_id] = (hoursM1[ea.artist_id] ?? 0) + h
      }
    }
    for (const ev of eventsM2.filter(e => SHOW_TYPES.has(e.type ?? ''))) {
      const h = hours(ev.start_time, ev.end_time)
      for (const ea of ev.event_artists) {
        hoursM2[ea.artist_id] = (hoursM2[ea.artist_id] ?? 0) + h
      }
    }

    const rows = Object.values(map).map(a => ({
      ...a,
      prodCount: a.prodIds.size,
      hoursM1: hoursM1[a.id] ?? 0,
      hoursM2: hoursM2[a.id] ?? 0,
    }))

    if (workloadSort === 'absence') {
      rows.sort((a, b) => b.absenceDays - a.absenceDays || (b.hoursM1 + b.hoursM2) - (a.hoursM1 + a.hoursM2))
    } else {
      rows.sort((a, b) => (b.hoursM1 + b.hoursM2) - (a.hoursM1 + a.hoursM2) || b.absenceDays - a.absenceDays)
    }
    return rows
  }, [events, artists, avails, period, eventsM1, eventsM2, workloadSort])

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
      <div className="flex items-center justify-between gap-4 px-8 py-5 -mx-8 -mt-8 mb-2" style={{ background: '#fff', borderBottom: '1px solid #e4ddd4' }}>
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
      <div className="grid grid-cols-5 gap-4">
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
          <table className="w-full text-sm">
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
                  'Na afiszu':   'bg-green-100 text-green-700',
                  'W produkcji': 'bg-amber-100 text-amber-700',
                  'Koncepcja':   'bg-slate-100 text-slate-600',
                  'Zawieszony':  'bg-amber-100 text-amber-700',
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
      )}

      {/* Charts row 1: workload + status */}
      <div className="grid grid-cols-5 gap-4">

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
      <div className="grid grid-cols-2 gap-4">

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

      {/* Artist workload table */}
      {!loading && artistTable.length > 0 && (() => {
        const MONTHS_PL = td.months
        const nowR  = new Date()
        const m1Lbl = MONTHS_PL[new Date(nowR.getFullYear(), nowR.getMonth() - 1, 1).getMonth()]
        const m2Lbl = MONTHS_PL[new Date(nowR.getFullYear(), nowR.getMonth() - 2, 1).getMonth()]
        return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{tr.workloadSection}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{tr.workloadSubtitle}</p>
            </div>
            <span className="text-xs text-gray-500">{tr.workloadCount(artistTable.length)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">{tr.colRank}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tr.colArtist}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tr.colProductions}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  <button
                    onClick={() => setWorkloadSort(s => s === 'absence' ? 'hours' : 'absence')}
                    className={`flex items-center gap-1 mx-auto transition-colors ${workloadSort === 'absence' ? '' : 'text-gray-400 hover:text-gray-600'}`}
                    style={workloadSort === 'absence' ? { color: '#c8102e' } : undefined}
                  >
                    {tr.colAbsenceDays}
                    <span className="text-[10px]">{workloadSort === 'absence' ? '↓' : '↕'}</span>
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span className={`flex items-center gap-1 mx-auto ${workloadSort === 'hours' ? '' : 'text-gray-500'}`} style={workloadSort === 'hours' ? { color: '#c8102e' } : undefined}>
                    Godz. {m1Lbl} {workloadSort === 'hours' && <span className="text-[10px]">↓</span>}
                  </span>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Godz. {m2Lbl}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tr.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {artistTable.map((a, i) => {
                const statusColors: Record<string, string> = {
                  'Dostępny':                   'bg-green-600 text-white',
                  'Dostępny tylko w Warszawie': 'bg-emerald-900 text-white',
                  'Niepewny':                   'bg-orange-500 text-white',
                  'Niedostępny':                'bg-red-600 text-white',
                  'Urlop':                      'bg-amber-400 text-black',
                  'Choroba':                    'bg-gray-900 text-white',
                }
                const sc = statusColors[a.status ?? ''] ?? 'bg-gray-100 text-gray-500'
                const maxEvents = artistTable[0]?.eventCount ?? 1
                const pct = Math.round((a.eventCount / maxEvents) * 100)
                const fmtH = (h: number) => h === 0 ? '—' : Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
                return (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3 text-xs text-gray-500 font-medium">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-gray-800">{a.prodCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.absenceDays > 0
                        ? <span className="text-sm font-bold text-amber-600">{a.absenceDays}</span>
                        : <span className="text-sm text-gray-500">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${a.hoursM1 > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                        {fmtH(a.hoursM1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${a.hoursM2 > 0 ? 'text-gray-500' : 'text-gray-400'}`}>
                        {fmtH(a.hoursM2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc}`}>{a.status ?? '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
