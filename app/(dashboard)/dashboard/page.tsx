'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheatre } from '@/lib/theatre-context'
import { useLanguage } from '@/lib/language-context'
import { findConflicts, CONFLICT_LABEL, CONFLICT_ICON, type ConflictResult, type ConflictReason } from '@/lib/conflicts'
import ConflictPanel from '@/components/ConflictPanel'
import { CategoryMarks } from '@/components/CategoryMarks'
import { sortByLastName } from '@/lib/names'
import { IconUser, IconMapPin, IconSun, IconHeart, IconXCircle, IconStar, IconInbox, IconCalendar, IconWarning } from '@/lib/icons'

/* ─── Constants ──────────────────────────────────────────────────── */
const SHOW_TYPES = new Set(['Spektakl', 'Spektakl gościnny', 'Premiera'])

const PROD_COLORS = ['bg-gray-100 text-gray-600']

/* ─── Types ──────────────────────────────────────────────────────── */
interface EventRow {
  id: string; title: string; start_time: string; end_time: string
  location: string | null; type: string | null
  production_title: string | null
  room_id: string | null; theatre_id: string | null
  artist_ids: string[]
}

interface DashConflict {
  a: EventRow; b: EventRow; reasons: ConflictReason[]; sharedArtistIds: string[]
}
interface SimpleRecord { id: string; name: string }
interface ArtistRow { id: string; name: string; status: string | null; role: string | null }
interface TechRow   { id: string; name: string; role: string | null; status: string | null; eventCount: number }
interface ProdRow   { id: string; title: string; status: string }
interface AvailRow  { artist_id: string; type: string; start_time: string; end_time: string }

/* ─── Helpers ────────────────────────────────────────────────────── */
function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function dayKey(iso: string) { return iso.slice(0, 10) }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function fmtTime(iso: string, localeStr: string) { return new Date(iso).toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' }) }
function eventDateParam(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
}
function theatreLabel(ev: EventRow, theatres: SimpleRecord[], selectedId: string | null): string | null {
  if (selectedId) return null
  return theatres.find(t => t.id === ev.theatre_id)?.name ?? null
}
function prodColor(title: string) {
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PROD_COLORS[h % PROD_COLORS.length]
}
function mapEvent(e: any): EventRow {
  const prod = Array.isArray(e.productions) ? e.productions[0] : e.productions
  return {
    id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time,
    location: e.location ?? null, type: e.type ?? null,
    production_title: prod?.title ?? null,
    room_id: e.room_id ?? null, theatre_id: e.theatre_id ?? null,
    artist_ids: (e.event_artists ?? []).map((ea: any) => ea.artist_id),
  }
}

function buildConflicts(events: EventRow[], techArtistIds: Set<string>): DashConflict[] {
  const evMap = new Map<string, EventRow>(events.map(e => [e.id, e]))
  const results = findConflicts(
    events.map(e => ({
      id: e.id, start_time: e.start_time, end_time: e.end_time,
      room_id: e.room_id, theatre_id: e.theatre_id, artist_ids: e.artist_ids,
    })),
    techArtistIds
  )
  return results.map(r => ({
    a: evMap.get(r.aId)!, b: evMap.get(r.bId)!,
    reasons: r.reasons, sharedArtistIds: r.sharedArtistIds,
  }))
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
  return <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">{children}</p>
}
function TipRow({ label, sub, dot }: { label: string; sub?: string; dot?: string }) {
  return (
    <span className="flex items-start gap-2 px-3 py-1.5">
      {dot && <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />}
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-gray-800 truncate">{label}</span>
        {sub && <span className="block text-[11px] text-gray-500">{sub}</span>}
      </span>
    </span>
  )
}
function TipEmpty({ text }: { text: string }) {
  return <p className="text-xs text-gray-500 px-3 py-2.5 italic">{text}</p>
}
function TipDivider() { return <span className="block h-px bg-gray-100 mx-3" /> }

/* ─── Page ───────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { selectedTheatreId } = useTheatre()
  const { t, locale } = useLanguage()
  const td = t.dashboard
  const localeStr = locale === 'pl' ? 'pl-PL' : 'en-US'

  const [loading,       setLoading]       = useState(true)
  const [artistCount,   setArtistCount]   = useState(0)
  const [unavailList,   setUnavailList]   = useState<ArtistRow[]>([])
  const [weekEvCount,   setWeekEvCount]   = useState(0)
  const [weekShows,     setWeekShows]     = useState<EventRow[]>([])
  const [activeProd,    setActiveProd]    = useState(0)
  const [inPrepList,    setInPrepList]    = useState<ProdRow[]>([])
  const [conflictPairs,     setConflictPairs]     = useState<DashConflict[]>([])
  const [showConflictPanel, setShowConflictPanel] = useState(false)
  const [conflictAlertSent, setConflictAlertSent] = useState(false)
  const [allRooms,          setAllRooms]          = useState<SimpleRecord[]>([])
  const [allTheatres,       setAllTheatres]       = useState<SimpleRecord[]>([])
  const [allArtistList,     setAllArtistList]     = useState<SimpleRecord[]>([])
  const [slidingEvents, setSlidingEvents] = useState<EventRow[]>([])
  const [dayOffset,     setDayOffset]     = useState(0)
  const [upcoming,      setUpcoming]      = useState<EventRow[]>([])
  const [stageByTitle,  setStageByTitle]  = useState<Map<string, 'Duża' | 'Mała'>>(new Map())
  const [catByTitle,    setCatByTitle]    = useState<Map<string, { fav: number; hit: number }>>(new Map())
  const [alertArtists,  setAlertArtists]  = useState<ArtistRow[]>([])
  const [artistAvails,  setArtistAvails]  = useState<AvailRow[]>([])
  const [availCounts,   setAvailCounts]   = useState({ dostepni: 0, urlop: 0, niedostepni: 0 })
  const [dostepniList,  setDostepniList]  = useState<ArtistRow[]>([])
  const [urlopList,     setUrlopList]     = useState<ArtistRow[]>([])
  const [niedostList,   setNiedostList]   = useState<ArtistRow[]>([])
  const [techToday,     setTechToday]     = useState<TechRow[]>([])
  const [nextPremiere,  setNextPremiere]  = useState<EventRow | null>(null)
  // New stat tiles
  const [showsNMConflicts,  setShowsNMConflicts]  = useState(0)
  const [showsM2Conflicts,  setShowsM2Conflicts]  = useState(0)
  const [notConfirmedCount, setNotConfirmedCount] = useState(0)
  const [notConfBreakdown, setNotConfBreakdown] = useState<{ noAvail: string[]; noConfirm: string[]; change: string[] }>({ noAvail: [], noConfirm: [], change: [] })
  const [showsNMCount,      setShowsNMCount]      = useState(0)
  const [showsNMList,       setShowsNMList]       = useState<EventRow[]>([])
  const [showsM2Count,      setShowsM2Count]      = useState(0)
  const [showsM2List,       setShowsM2List]       = useState<EventRow[]>([])
  const [vacNextCount,      setVacNextCount]      = useState(0)
  const [vacNextNames,      setVacNextNames]      = useState<string[]>([])
  // Proposal-level cast conflicts
  const [castConflicts,     setCastConflicts]     = useState<import('@/lib/conflicts').ProposalConflict[]>([])
  // Per-month repertoire plan info: approved flag + counts (from the first
  // draft proposal when the month is not yet approved)
  interface MonthPlan { approved: boolean; shows: number; titles: number; hasProposal: boolean }
  const [monthPlans, setMonthPlans] = useState<{ nm: MonthPlan | null; m2: MonthPlan | null }>({ nm: null, m2: null })

  useEffect(() => { fetchAll() }, [selectedTheatreId])

  async function fetchAll() {
    setLoading(true)
    const now     = new Date()
    const today   = localDate(now)
    const weekEnd = localDate(addDays(now, 7))
    const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    const evSel = 'id, title, start_time, end_time, location, type, room_id, theatre_id, productions(title), event_artists(artist_id)'

    // Next-month and month+2 date ranges
    const nmStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nmEnd   = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    const m2Start = new Date(now.getFullYear(), now.getMonth() + 2, 1)
    const m2End   = new Date(now.getFullYear(), now.getMonth() + 3, 0)
    const nmStartStr = localDate(nmStart)
    const nmEndStr   = localDate(nmEnd)
    const m2StartStr = localDate(m2Start)
    const m2EndStr   = localDate(m2End)

    // All event queries filtered by theatre when selected
    let todayQ = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T00:00:00`).lt('start_time', `${localDate(addDays(now, 7))}T00:00:00`).order('start_time')
    let weekQ = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T00:00:00`).lt('start_time', `${weekEnd}T00:00:00`).order('start_time')
    let upcomQ = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T${nowTime}:00`)
      .lt('start_time', `${localDate(addDays(now, 14))}T00:00:00`)
      .order('start_time').limit(15)
    let premiereQ = supabase.from('events').select(evSel)
      .eq('type', 'Premiera').gte('start_time', `${today}T00:00:00`).order('start_time').limit(1)
    // Conflict detection through end of month+2
    let conflictQ = supabase.from('events').select(evSel)
      .gte('start_time', `${today}T00:00:00`)
      .lte('start_time', `${m2EndStr}T23:59:59`)
    // Shows next month
    let showsNMQ = supabase.from('events').select(evSel)
      .in('type', Array.from(SHOW_TYPES))
      .gte('start_time', `${nmStartStr}T00:00:00`)
      .lte('start_time', `${nmEndStr}T23:59:59`)
      .order('start_time')
    // Shows month+2
    let showsM2Q = supabase.from('events').select(evSel)
      .in('type', Array.from(SHOW_TYPES))
      .gte('start_time', `${m2StartStr}T00:00:00`)
      .lte('start_time', `${m2EndStr}T23:59:59`)
      .order('start_time')
    // Tomorrow's shows (for participation-confirmation gaps)
    const tomorrowStr = localDate(addDays(now, 1))
    let tomorrowShowsQ = supabase.from('events').select('id, theatre_id, event_artists(artist_id)')
      .in('type', Array.from(SHOW_TYPES))
      .gte('start_time', `${tomorrowStr}T00:00:00`).lte('start_time', `${tomorrowStr}T23:59:59`)

    if (selectedTheatreId) {
      todayQ    = todayQ.eq('theatre_id', selectedTheatreId)
      weekQ     = weekQ.eq('theatre_id', selectedTheatreId)
      upcomQ    = upcomQ.eq('theatre_id', selectedTheatreId)
      premiereQ = premiereQ.eq('theatre_id', selectedTheatreId)
      conflictQ = conflictQ.eq('theatre_id', selectedTheatreId)
      showsNMQ  = showsNMQ.eq('theatre_id', selectedTheatreId)
      showsM2Q  = showsM2Q.eq('theatre_id', selectedTheatreId)
      tomorrowShowsQ = tomorrowShowsQ.eq('theatre_id', selectedTheatreId)
    }

    // Tolerancyjnie na brak migracji 'stage' — ponów bez tej kolumny.
    const buildProdQ = (withStage: boolean) => {
      const cols: string = `id, title, status, ${withStage ? 'stage, favourite_level, hit_level, ' : ''}price_category`
      let q = supabase.from('productions').select(cols)
      if (selectedTheatreId) q = q.eq('theatre_id', selectedTheatreId)
      return q
    }
    const prodQ = (async () => {
      const r = await buildProdQ(true)
      return r.error ? await buildProdQ(false) : r
    })()

    // Fetch all current Urlop/Choroba records upfront (small table — trivial cost)
    const availQ = supabase.from('availabilities')
      .select('artist_id, type, start_time, end_time')
      .in('type', ['Urlop', 'Choroba'])
      .gte('end_time', `${today}T00:00:00`)
      .order('start_time')

    const tomorrow = localDate(addDays(now, 1))

    const [
      { data: artistData },
      { data: prodsData },
      { data: todayEvData },
      { data: weekEvData },
      { data: upcomData },
      { data: premiereData },
      { data: conflictEvData },
      { data: techTeam },
      { data: roomsData },
      { data: theatresData },
      { data: avData },
      { data: showsNMData },
      { data: showsM2Data },
      { data: tomorrowDsData },
      { data: vacNMData },
      { data: tomorrowShowsData },
    ] = await Promise.all([
      // artist_productions included so we can scope artists to the selected theatre
      supabase.from('artists').select('id, name, status, role, teams(name), artist_productions(productions(theatre_id))'),
      prodQ,
      todayQ, weekQ, upcomQ, premiereQ, conflictQ,
      supabase.from('teams').select('id').eq('name', 'Technique').single(),
      supabase.from('rooms').select('id, name').order('name'),
      supabase.from('theatres').select('id, name').order('name'),
      availQ,
      showsNMQ,
      showsM2Q,
      // Actor day status for tomorrow — who hasn't confirmed availability
      supabase.from('actor_day_status')
        .select('artist_id')
        .eq('date', tomorrow),
      // Actor vacation days in next month
      supabase.from('actor_day_status')
        .select('artist_id')
        .eq('status', 'Urlop')
        .gte('date', nmStartStr)
        .lte('date', nmEndStr),
      tomorrowShowsQ,
    ])

    const allArtistsRaw = sortByLastName((artistData ?? []) as any[])

    // Scope to artists who have at least one production at the selected theatre
    const scopedRaw = selectedTheatreId
      ? allArtistsRaw.filter(a =>
          (a.artist_productions ?? []).some((ap: any) =>
            ap.productions?.theatre_id === selectedTheatreId
          )
        )
      : allArtistsRaw

    const artists: ArtistRow[] = scopedRaw.map((a: any) => ({
      id: a.id, name: a.name, status: a.status, role: a.role,
    }))
    const techArtistIds = new Set<string>(
      allArtistsRaw.filter((a: any) => {
        const team = Array.isArray(a.teams) ? a.teams[0] : a.teams
        return team?.name === 'Technique'
      }).map((a: any) => a.id)
    )
    const prods   = (prodsData ?? []) as unknown as ProdRow[]
    const unavail = artists.filter(a => a.status && a.status !== 'Aktywny')

    setArtistCount(artists.length)
    setUnavailList(unavail)
    setActiveProd(prods.filter(p => p.status === 'Bieżące').length)
    setInPrepList(prods.filter(p => p.status === 'Planowane'))

    // Mapa scena per tytuł — z twardego pola stage: mala → Mała, inaczej Duża
    const stages = new Map<string, 'Duża' | 'Mała'>()
    const cats = new Map<string, { fav: number; hit: number }>()
    for (const p of prods as any[]) {
      stages.set(p.title, p.stage === 'mala' ? 'Mała' : 'Duża')
      cats.set(p.title, { fav: p.favourite_level ?? 0, hit: p.hit_level ?? 0 })
    }
    setStageByTitle(stages)
    setCatByTitle(cats)

    setAllRooms(roomsData ?? [])
    setAllTheatres(theatresData ?? [])
    // Keep full list for event-creation dropdowns (not scoped)
    setAllArtistList(allArtistsRaw.map((a: any) => ({ id: a.id, name: a.name })))

    const weekEvs = (weekEvData ?? []).map(mapEvent)
    const pairs   = buildConflicts((conflictEvData ?? []).map(mapEvent), techArtistIds)
    setWeekEvCount(weekEvs.filter(e => !SHOW_TYPES.has(e.type ?? '')).length)
    setWeekShows(weekEvs.filter(e => SHOW_TYPES.has(e.type ?? '')))
    setConflictPairs(pairs)

    // Count conflicts falling within each month (nm / m2)
    const inMonth = (evStartTime: string, startStr: string, endStr: string) =>
      evStartTime >= `${startStr}T00:00:00` && evStartTime <= `${endStr}T23:59:59`
    const conflictsNM = pairs.filter(p =>
      inMonth(p.a.start_time, nmStartStr, nmEndStr) || inMonth(p.b.start_time, nmStartStr, nmEndStr)
    ).length
    const conflictsM2 = pairs.filter(p =>
      inMonth(p.a.start_time, m2StartStr, m2EndStr) || inMonth(p.b.start_time, m2StartStr, m2EndStr)
    ).length
    setShowsNMConflicts(conflictsNM)
    setShowsM2Conflicts(conflictsM2)

    const todayMapped = (todayEvData ?? []).map(mapEvent)
    setSlidingEvents(todayMapped)
    setUpcoming((upcomData ?? []).map(mapEvent))
    setNextPremiere(premiereData?.[0] ? mapEvent(premiereData[0]) : null)

    setAlertArtists(unavail)
    const dostepni    = artists.filter(a => !a.status || a.status === 'Aktywny')
    const urlop       = artists.filter(a => a.status === 'Na urlopie')
    const niedostepni = artists.filter(a => a.status && ['Choroba','Niedyspozyjny'].includes(a.status))
    setAvailCounts({ dostepni: dostepni.length, urlop: urlop.length, niedostepni: niedostepni.length })
    setDostepniList(dostepni)
    setUrlopList(urlop)
    setNiedostList(niedostepni)
    setArtistAvails(avData ?? [])

    // Shows next month / month+2
    const nmShows = (showsNMData ?? []).map(mapEvent)
    const m2Shows = (showsM2Data ?? []).map(mapEvent)
    setShowsNMCount(nmShows.length)
    setShowsNMList(nmShows)
    setShowsM2Count(m2Shows.length)
    setShowsM2List(m2Shows)

    // ── Braki potwierdzeń NA JUTRO — trzy kategorie ──
    const allArtistsMap = new Map(allArtistsRaw.map((a: any) => [a.id, a.name as string]))
    const castArtists = allArtistsRaw.filter((a: any) => {
      const teams = Array.isArray(a.teams) ? a.teams : (a.teams ? [a.teams] : [])
      return teams.some((t: any) => t?.name === 'Cast')
    })

    // A: brak deklaracji dostępności (Cast bez wpisu w kalendarzu na jutro)
    const tomorrowAvailIds = new Set((tomorrowDsData ?? []).map((r: any) => r.artist_id))
    const noAvail = castArtists.filter((a: any) => !tomorrowAvailIds.has(a.id))

    // B/C: brak potwierdzenia udziału w jutrzejszych spektaklach (event_confirmations = pending)
    const tomorrowEventIds = ((tomorrowShowsData ?? []) as any[]).map(e => e.id)
    const noConfirmIds = new Set<string>()
    const changeIds    = new Set<string>()
    if (tomorrowEventIds.length > 0) {
      const [{ data: pendConf }, { data: changeMsgs }] = await Promise.all([
        supabase.from('event_confirmations')
          .select('event_id, artist_id, artists(name)')
          .in('event_id', tomorrowEventIds).eq('status', 'pending'),
        supabase.from('actor_messages')
          .select('artist_id, related_event_id')
          .eq('kind', 'event_change').in('related_event_id', tomorrowEventIds),
      ])
      // pary (event, artist) które dostały powiadomienie o zmianie → niepotwierdzona zmiana
      const changed = new Set((changeMsgs ?? []).map((m: any) => `${m.related_event_id}:${m.artist_id}`))
      for (const c of (pendConf ?? []) as any[]) {
        const nm = (Array.isArray(c.artists) ? c.artists[0] : c.artists)?.name
        if (!nm) continue
        if (changed.has(`${c.event_id}:${c.artist_id}`)) changeIds.add(nm)
        else noConfirmIds.add(nm)
      }
    }

    const noAvailNames  = noAvail.map((a: any) => a.name as string)
    const noConfirmNames = [...noConfirmIds]
    const changeNames    = [...changeIds]
    setNotConfBreakdown({ noAvail: noAvailNames, noConfirm: noConfirmNames, change: changeNames })
    // łączna liczba unikalnych osób z jakimkolwiek brakiem
    setNotConfirmedCount(new Set([...noAvailNames, ...noConfirmNames, ...changeNames]).size)

    // Vacations next month: unique artists
    const vacArtistIds = [...new Set((vacNMData ?? []).map((r: any) => r.artist_id))]
    setVacNextCount(vacArtistIds.length)
    setVacNextNames(vacArtistIds.map(id => allArtistsMap.get(id) ?? id).filter(Boolean))

    if (techTeam?.id) {
      const { data: techArtists } = await supabase
        .from('artists').select('id, name, role, status').eq('team_id', techTeam.id).order('name')
      setTechToday(sortByLastName(techArtists ?? []).map(a => ({
        id: a.id, name: a.name, role: a.role, status: a.status,
        eventCount: todayMapped.filter(e => e.artist_ids.includes(a.id) && dayKey(e.start_time) === today).length,
      })))
    }

    // ── Proposal-level cast conflicts ─────────────────────────────────────
    try {
      const { detectProposalConflicts } = await import('@/lib/conflicts')
      const [propJson, castRes] = await Promise.all([
        fetch('/api/planning/generate').then(r => r.json()),
        supabase.from('productions').select('title, artist_productions(artists(id, name))'),
      ])
      const allProposals: any[] = propJson.proposals ?? []

      // ── Month plan info for the Repertuar tiles ──
      const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      function planFor(key: string) {
        const monthProps = allProposals.filter(p => p.month === key)
        const approved = monthProps.find(p => p.status === 'approved')
        const src = approved
          // First draft of the newest batch (list is created_at desc → take the last matching "1")
          ?? monthProps.filter(p => p.status === 'draft')
               .find(p => /(^|\s)1$/.test(String(p.label ?? '').trim()))
          ?? monthProps.filter(p => p.status === 'draft')[0]
        if (!src) return { approved: false, shows: 0, titles: 0, hasProposal: false }
        const evs: any[] = src.proposal_data ?? []
        return {
          approved: !!approved,
          shows: evs.length,
          titles: new Set(evs.map(e => e.production_title)).size,
          hasProposal: true,
        }
      }
      setMonthPlans({
        nm: planFor(monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1))),
        m2: planFor(monthKey(new Date(now.getFullYear(), now.getMonth() + 2, 1))),
      })
      // Keep conflict detection on approved proposals only
      propJson.proposals = allProposals.filter(p => p.status === 'approved')
      // Build maps
      const pCastMap = new Map<string, string[]>()
      const aNameMap = new Map<string, string>()
      for (const p of castRes.data ?? []) {
        const ids: string[] = []
        for (const ap of (p as any).artist_productions ?? []) {
          const a = Array.isArray(ap.artists) ? ap.artists[0] : ap.artists
          if (a?.id) { ids.push(a.id); aNameMap.set(a.id, a.name) }
        }
        pCastMap.set((p as any).title, ids)
      }
      // Collect all events from approved proposals
      const proposalEvents = (propJson.proposals ?? []).flatMap((pr: any) =>
        (pr.proposal_data ?? []).map((e: any) => ({
          date:             e.date,
          production_title: e.production_title,
          room_name:        e.room_name ?? null,
          start_time:       e.start_time ?? '19:00',
          end_time:         e.end_time   ?? '22:00',
        }))
      )
      const allCastConflicts = pCastMap.size > 0
        ? detectProposalConflicts(proposalEvents, pCastMap, aNameMap)
        : []
      setCastConflicts(allCastConflicts)
    } catch { /* non-critical */ }

    setLoading(false)
  }

  useEffect(() => { setConflictAlertSent(false) }, [conflictPairs])

  async function handleSendConflictAlert() {
    setConflictAlertSent(true) // optimistic
    await fetch('/api/notify/conflict-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conflicts: conflictPairs.map(p => ({
          eventA: { title: p.a.title, start_time: p.a.start_time, end_time: p.a.end_time },
          eventB: { title: p.b.title, start_time: p.b.start_time, end_time: p.b.end_time },
          reasons: p.reasons,
          artistNames: p.sharedArtistIds.map(id => allArtistList.find(a => a.id === id)?.name).filter(Boolean),
          roomName: p.reasons.includes('room') ? (allRooms.find(r => r.id === (p.a.room_id ?? p.b.room_id))?.name ?? null) : null,
        })),
      }),
    }).catch(() => setConflictAlertSent(false))
  }

  /* ── Derived ── */
  const now      = new Date()

  // Sliding day view
  const slidingDay      = addDays(now, dayOffset)
  const slidingDayKey   = localDate(slidingDay)
  const displayDayEvents = slidingEvents.filter(e => dayKey(e.start_time) === slidingDayKey)
  const isToday          = dayOffset === 0
  const slidingDayLabel  = isToday
    ? `Dziś, ${now.getDate()} ${td.months[now.getMonth()]}`
    : dayOffset === 1
    ? `Jutro, ${slidingDay.getDate()} ${td.months[slidingDay.getMonth()]}`
    : `${td.daysShort[slidingDay.getDay()]}. ${slidingDay.getDate()} ${td.months[slidingDay.getMonth()]}`

  // Upcoming shows only
  const upcomingShows = upcoming.filter(e => SHOW_TYPES.has(e.type ?? ''))

  const STATUS_LABEL: Record<string, string> = {
    'Na urlopie':    td.statusVacation,
    'Choroba':       td.statusSick,
    'Niedyspozyjny': td.statusUnavailable,
    'Nieaktywny':    td.statusInactive,
  }
  const DAYS_SHORT = td.daysShort
  const MONTHS_PL  = td.months
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
      <TipHeader>{td.tipUnavailableHeader}</TipHeader>
      {unavailList.length === 0
        ? <TipEmpty text={td.tipAllAvailable} />
        : unavailList.map(a => {
            const dot        = a.status === 'Na urlopie' ? 'bg-amber-400' : a.status === 'Choroba' ? 'bg-red-400' : 'bg-gray-400'
            const avType     = a.status === 'Na urlopie' ? 'Urlop' : a.status === 'Choroba' ? 'Choroba' : null
            const avail      = avType ? artistAvails.filter(av => av.artist_id === a.id && av.type === avType) : []
            const current    = avail[0]
            const statusLabel = STATUS_LABEL[a.status!] ?? a.status!
            const sub        = current
              ? `${statusLabel} · ${fmtDate(current.start_time)} – ${fmtDate(current.end_time)}`
              : statusLabel
            return <TipRow key={a.id} label={a.name} sub={sub} dot={dot} />
          })
      }
      <span className="block pb-1" />
    </>
  )

  const showsTip = (
    <>
      <TipHeader>{td.tipShowsHeader}</TipHeader>
      {weekShows.length === 0
        ? <TipEmpty text={td.tipNoShows} />
        : weekShows.map(e => (
            <TipRow key={e.id}
              label={e.title}
              sub={`${DAYS_SHORT[new Date(e.start_time).getDay()]} ${new Date(e.start_time).getDate()} · ${fmtTime(e.start_time, localeStr)}`}
              dot="bg-green-400" />
          ))
      }
      <span className="block pb-1" />
    </>
  )

  const inPrepTip = (
    <>
      <TipHeader>{td.tipInPrepHeader}</TipHeader>
      {inPrepList.length === 0
        ? <TipEmpty text={td.tipNone} />
        : inPrepList.map(p => (
            <TipRow key={p.id} label={p.title}
              sub={p.status}
              dot="bg-amber-400" />
          ))
      }
      <span className="block pb-1" />
    </>
  )

  const conflictTip = (
    <>
      <TipHeader>{td.tipConflictsHeader}</TipHeader>
      {conflictPairs.length === 0
        ? <TipEmpty text={td.tipNoConflicts} />
        : conflictPairs.map((p, i) => {
            const sharedArtists = p.sharedArtistIds
              .map(id => allArtistList.find(a => a.id === id)?.name)
              .filter(Boolean) as string[]
            const roomId   = p.reasons.includes('room') ? (p.a.room_id ?? p.b.room_id) : null
            const roomName = roomId ? allRooms.find(r => r.id === roomId)?.name : null

            return (
              <span key={i} className="block">
                {i > 0 && <TipDivider />}
                <span className="flex flex-wrap items-center gap-1 px-3 pt-2">
                  {p.reasons.map(r => (
                    <span key={r} className="text-[10px] font-semibold px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                      {CONFLICT_ICON[r]} {CONFLICT_LABEL[r]}
                    </span>
                  ))}
                  <span className="text-[10px] text-gray-500 ml-auto">
                    {new Date(p.a.start_time).toLocaleDateString(localeStr, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </span>
                {sharedArtists.length > 0 && (
                  <span className="flex items-center gap-1.5 px-3 pt-1 pb-0.5">
                    <IconUser size={11} className="text-gray-500 shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-700">{sharedArtists.join(', ')}</span>
                  </span>
                )}
                {roomName && (
                  <span className="flex items-center gap-1.5 px-3 pt-1 pb-0.5">
                    <IconMapPin size={11} className="text-gray-500 shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-700">{roomName}</span>
                  </span>
                )}
                <TipRow label={p.a.title} sub={`${fmtTime(p.a.start_time, localeStr)}–${fmtTime(p.a.end_time, localeStr)}`} dot="bg-red-400" />
                <TipRow label={p.b.title} sub={`${fmtTime(p.b.start_time, localeStr)}–${fmtTime(p.b.end_time, localeStr)}`} dot="bg-red-300" />
              </span>
            )
          })
      }
      <span className="block pb-1" />
    </>
  )

  function alertTip(status: string) {
    const group = alertArtists.filter(a => a.status === status)
    return (
      <>
        <TipHeader>{STATUS_LABEL[status] ?? status}</TipHeader>
        {group.map(a => {
          const avail = artistAvails.filter(av => av.artist_id === a.id && av.type === (status === 'Na urlopie' ? 'Urlop' : 'Choroba'))
          const current = avail[0]
          const dateStr = current ? `${fmtDate(current.start_time)} – ${fmtDate(current.end_time)}` : undefined
          return <TipRow key={a.id} label={a.name} sub={dateStr} dot={status === 'Na urlopie' ? 'bg-amber-400' : status === 'Choroba' ? 'bg-red-400' : 'bg-gray-400'} />
        })}
        <span className="block pb-1" />
      </>
    )
  }

  /* ── Polish pluralization ── */
  function plKonflikt(n: number) {
    if (n === 1) return 'konflikt'
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'konflikty'
    return 'konfliktów'
  }

  /* ── Month labels for new tiles ── */
  const nmDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nmMonthLabel = MONTHS_PL[nmDate.getMonth()]
  const nmMonthKey   = `${nmDate.getFullYear()}-${String(nmDate.getMonth() + 1).padStart(2, '0')}`
  const m2MonthLabel = MONTHS_PL[new Date(now.getFullYear(), now.getMonth() + 2, 1).getMonth()]

  /* ── Tooltip content for new tiles ── */
  const notConfirmedTip = (() => {
    const { noAvail, noConfirm, change } = notConfBreakdown
    const empty = noAvail.length === 0 && noConfirm.length === 0 && change.length === 0
    return (
      <>
        <TipHeader>Braki potwierdzeń na jutro</TipHeader>
        {empty ? <TipEmpty text="Wszystko potwierdzone" /> : (
          <>
            {change.length > 0 && (
              <>
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#c8102e' }}>Niepotwierdzona zmiana ({change.length})</p>
                {change.map(n => <TipRow key={'ch'+n} label={n} dot="bg-red-500" />)}
              </>
            )}
            {noConfirm.length > 0 && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#b45309' }}>Brak potwierdzenia udziału ({noConfirm.length})</p>
                {noConfirm.map(n => <TipRow key={'nc'+n} label={n} dot="bg-amber-400" />)}
              </>
            )}
            {noAvail.length > 0 && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#7a7068' }}>Brak deklaracji dostępności ({noAvail.length})</p>
                {noAvail.map(n => <TipRow key={'na'+n} label={n} dot="bg-gray-400" />)}
              </>
            )}
          </>
        )}
        <span className="block pb-1" />
      </>
    )
  })()

  function repertuarMonthTip(list: EventRow[], label: string) {
    const byTitle = new Map<string, EventRow[]>()
    for (const e of list) {
      const key = e.production_title ?? e.title
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key)!.push(e)
    }
    return (
      <>
        <TipHeader>Repertuar – {label}</TipHeader>
        {byTitle.size === 0
          ? <TipEmpty text="Brak spektakli" />
          : Array.from(byTitle.entries()).map(([title, evs]) => (
              <span key={title} className="block">
                <TipRow label={title} sub={`${evs.length} spektakl${evs.length === 1 ? '' : evs.length < 5 ? 'e' : 'i'}`} dot="bg-gray-400" />
              </span>
            ))
        }
        <span className="block pb-1" />
      </>
    )
  }

  function showsMonthTip(list: EventRow[], label: string) {
    return (
      <>
        <TipHeader>Spektakle – {label}</TipHeader>
        {list.length === 0
          ? <TipEmpty text="Brak spektakli" />
          : list.map(e => (
              <TipRow key={e.id}
                label={e.production_title ?? e.title}
                sub={new Date(e.start_time).toLocaleDateString(localeStr, { day: 'numeric', month: 'short' }) + ' · ' + fmtTime(e.start_time, localeStr)}
                dot="bg-gray-400" />
            ))
        }
        <span className="block pb-1" />
      </>
    )
  }

  const vacNextTip = (
    <>
      <TipHeader>Urlopy – {nmMonthLabel}</TipHeader>
      {vacNextNames.length === 0
        ? <TipEmpty text="Brak urlopów" />
        : vacNextNames.map(name => <TipRow key={name} label={name} dot="bg-amber-400" />)
      }
      <span className="block pb-1" />
    </>
  )

  /* ── Stat cards config ── */
  const titlesNMCount = new Set(showsNMList.filter(e => e.production_title).map(e => e.production_title)).size

  // Cast-conflict tooltip
  const castConflictTip = (
    <>
      <TipHeader>Konflikty obsady – repertuar</TipHeader>
      {castConflicts.length === 0
        ? <TipEmpty text="Brak konfliktów" />
        : castConflicts.slice(0, 8).map((c, i) => (
            <span key={i} className="block px-3 py-2 text-xs border-b last:border-0" style={{ borderColor: '#f2ede6' }}>
              <span className="font-semibold" style={{ color: '#c8102e' }}>
                {c.productions[0].title} ↔ {c.productions[1].title}
              </span>
              <span className="block text-[10px] mt-0.5" style={{ color: '#a89e92' }}>
                {c.date} · {c.artistNames.join(', ')}
              </span>
            </span>
          ))
      }
      {castConflicts.length > 8 && (
        <span className="block px-3 py-1.5 text-[11px]" style={{ color: '#a89e92' }}>
          +{castConflicts.length - 8} więcej
        </span>
      )}
      <span className="block pb-1" />
    </>
  )

  const statCards = [
    {
      label: 'Nie potwierdzili na jutro', value: notConfirmedCount,
      sub: notConfirmedCount > 0
        ? [
            notConfBreakdown.change.length   ? `${notConfBreakdown.change.length}× zmiana` : null,
            notConfBreakdown.noConfirm.length ? `${notConfBreakdown.noConfirm.length}× udział` : null,
            notConfBreakdown.noAvail.length   ? `${notConfBreakdown.noAvail.length}× dostępność` : null,
          ].filter(Boolean).join(' · ')
        : 'wszystko potwierdzone',
      warn: notConfirmedCount > 0,
      tip: notConfirmedTip, tipAlign: 'left' as const,
      cta: notConfirmedCount > 0 ? { label: 'Wyślij przypomnienie', href: '/messages' } : undefined,
    },
    {
      label: `Repertuar – ${nmMonthLabel}`,
      value: monthPlans.nm?.approved === false && monthPlans.nm.hasProposal ? monthPlans.nm.shows : showsNMCount,
      sub: (() => {
        const t = monthPlans.nm?.approved === false && monthPlans.nm.hasProposal ? monthPlans.nm.titles : titlesNMCount
        return t > 0 ? `${t} tytuł${t === 1 ? '' : t < 5 ? 'y' : 'ów'}` : 'brak spektakli'
      })(),
      warn: false,
      badge: monthPlans.nm?.hasProposal ? { approved: monthPlans.nm.approved } : undefined,
      tip: repertuarMonthTip(showsNMList, nmMonthLabel), tipAlign: 'left' as const,
      cta: monthPlans.nm?.approved
        ? { label: `Zobacz ${nmMonthLabel}`, href: `/calendar?month=${nmMonthKey}` }
        : monthPlans.nm?.hasProposal
        ? { label: `Zatwierdź ${nmMonthLabel}`, href: '/planning' }
        : undefined,
    },
    {
      label: `Repertuar – ${m2MonthLabel}`,
      value: monthPlans.m2?.approved === false && monthPlans.m2.hasProposal ? monthPlans.m2.shows : showsM2Count,
      sub: (() => {
        if (showsM2Conflicts > 0) return `${showsM2Conflicts} ${plKonflikt(showsM2Conflicts)}`
        const t = monthPlans.m2?.approved === false && monthPlans.m2.hasProposal
          ? monthPlans.m2.titles
          : new Set(showsM2List.filter(e => e.production_title).map(e => e.production_title)).size
        return t > 0 ? `${t} tytuł${t === 1 ? '' : t < 5 ? 'y' : 'ów'}` : 'brak'
      })(),
      warn: showsM2Conflicts > 0,
      badge: monthPlans.m2?.hasProposal ? { approved: monthPlans.m2.approved } : undefined,
      tip: showsMonthTip(showsM2List, m2MonthLabel), tipAlign: 'center' as const,
      onClick: showsM2Conflicts > 0 ? () => setShowConflictPanel(true) : undefined,
      cta: monthPlans.m2?.hasProposal && !monthPlans.m2.approved
        ? { label: `Zatwierdź ${m2MonthLabel}`, href: '/planning' }
        : showsM2Count === 0 && !monthPlans.m2?.hasProposal
        ? { label: `Zaplanuj ${m2MonthLabel}`, href: '/planning' }
        : undefined,
    },
    {
      label: 'Konflikty obsady', value: castConflicts.length,
      sub: castConflicts.length > 0
        ? `${[...new Set(castConflicts.flatMap(c => c.artistNames))].slice(0, 2).join(', ')}${castConflicts.flatMap(c => c.artistNames).length > 2 ? '…' : ''}`
        : 'brak konfliktów',
      warn: castConflicts.length > 0,
      tip: castConflictTip, tipAlign: 'right' as const,
      onClick: castConflicts.length > 0 ? () => window.location.assign('/calendar') : undefined,
      cta: castConflicts.length > 0 ? { label: 'Rozwiąż konflikty', href: '/calendar' } : undefined,
    },
  ]

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-[#e4ddd4] border-t-[#7a7068] rounded-full animate-spin" />
          <span className="text-sm">{td.loading}</span>
        </div>
      </div>
    )
  }

  return (
    <>
    {showConflictPanel && (
      <ConflictPanel
        conflicts={conflictPairs.map(p => ({
          a: { id: p.a.id, title: p.a.title, type: p.a.type, start_time: p.a.start_time, end_time: p.a.end_time, room_id: p.a.room_id, theatre_id: p.a.theatre_id, production_title: p.a.production_title },
          b: { id: p.b.id, title: p.b.title, type: p.b.type, start_time: p.b.start_time, end_time: p.b.end_time, room_id: p.b.room_id, theatre_id: p.b.theatre_id, production_title: p.b.production_title },
          reasons: p.reasons,
          sharedArtistIds: p.sharedArtistIds,
        }))}
        allArtists={allArtistList}
        allRooms={allRooms}
        allTheatres={allTheatres}
        onClose={() => setShowConflictPanel(false)}
      />
    )}
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {statCards.map(s => (
          <div
            key={s.label}
            className={`bg-white border border-[#e4ddd4] rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col gap-0.5 md:gap-1 md:min-h-[120px] transition-shadow ${s.onClick ? 'cursor-pointer hover:shadow-md hover:border-[#cec5b8]' : ''}`}
            onClick={s.onClick}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium" style={{ color: '#7a7068' }}>{s.label}</p>
              {(s as any).badge && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={(s as any).badge.approved
                    ? { background: '#dcfce7', color: '#166534' }
                    : { background: '#fef3c7', color: '#92400e' }}
                >
                  {(s as any).badge.approved ? '✓ Zatwierdzony' : 'Niezatwierdzony'}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5 md:mt-1">
              <p className={`text-3xl md:text-4xl font-bold leading-none ${s.warn ? 'text-red-600' : ''}`} style={s.warn ? undefined : { color: '#1a1410' }}>{s.value}</p>
              {(s as any).badge && (
                <span className="text-xs font-medium" style={{ color: '#a89e92' }}>spektakli</span>
              )}
            </div>
            <Tooltip tip={s.tip} align={s.tipAlign}>
              <span className={`text-xs font-medium mt-0.5 md:mt-1 underline decoration-dotted underline-offset-2 cursor-help transition-colors
                ${s.warn ? 'text-red-500 decoration-red-300' : 'text-gray-500 decoration-gray-300'}`}>
                {s.sub}
              </span>
            </Tooltip>
            {s.cta && (
              <div className="mt-auto pt-2 md:pt-3" onClick={e => e.stopPropagation()}>
                <Link
                  href={s.cta.href}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{
                    background: s.warn ? '#fef2f2' : '#f2ede6',
                    color: s.warn ? '#c8102e' : '#1a1410',
                    border: `1px solid ${s.warn ? '#fecaca' : '#e4ddd4'}`,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = s.warn ? '#fee2e2' : '#e4ddd4')}
                  onMouseLeave={e => (e.currentTarget.style.background = s.warn ? '#fef2f2' : '#f2ede6')}
                >
                  {s.cta.label}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>


      {/* ── 2-column body ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* LEFT — Sliding day view ──────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Header z nawigacją */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => setDayOffset(o => Math.max(0, o - 1))}
              disabled={dayOffset === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4', flexShrink: 0 }}
              onMouseEnter={e => { if (dayOffset > 0) e.currentTarget.style.background = '#e4ddd4' }}
              onMouseLeave={e => (e.currentTarget.style.background = '#f2ede6')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>

            <div className="flex-1 text-center">
              <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>{slidingDayLabel}</h3>
            </div>

            <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
              {displayDayEvents.length > 0 && (
                <span className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: '#e4ddd4', color: '#7a7068' }}>
                  {td.eventCount(displayDayEvents.length)}
                </span>
              )}
              <button
                onClick={() => setDayOffset(o => Math.min(6, o + 1))}
                disabled={dayOffset === 6}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
                style={{ background: '#f2ede6', color: '#7a7068', border: '1px solid #e4ddd4' }}
                onMouseEnter={e => { if (dayOffset < 6) e.currentTarget.style.background = '#e4ddd4' }}
                onMouseLeave={e => (e.currentTarget.style.background = '#f2ede6')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Dzienna nawigacja — mini paginacja dni */}
          <div className="flex border-b border-gray-50" style={{ background: '#faf8f5' }}>
            {Array.from({ length: 7 }, (_, i) => {
              const d    = addDays(now, i)
              const isSelected = i === dayOffset
              const hasBadge   = slidingEvents.some(e => dayKey(e.start_time) === localDate(d))
              return (
                <button key={i} onClick={() => setDayOffset(i)}
                  className="flex-1 flex flex-col items-center py-2 transition-colors"
                  style={{ background: isSelected ? '#1a1410' : 'transparent', borderRadius: isSelected ? 6 : 0 }}>
                  <span className="text-[10px] font-medium" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : '#b8b0a4' }}>
                    {td.daysShort[d.getDay()]}
                  </span>
                  <span className="text-xs font-bold mt-0.5" style={{ color: isSelected ? '#fff' : '#3e3830' }}>
                    {d.getDate()}
                  </span>
                  {hasBadge && (
                    <span className="w-1.5 h-1.5 rounded-full mt-1" style={{ background: isSelected ? 'rgba(255,255,255,0.6)' : '#e4ddd4' }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Lista wydarzeń */}
          {displayDayEvents.length === 0 ? (
            <div className="text-center py-10" style={{ color: '#a89e92' }}>
              <div className="flex justify-center mb-2"><span style={{ color: '#a89e92' }}><IconInbox size={28} /></span></div>
              <p className="text-xs">{isToday ? td.noTodayEvents : 'Brak wydarzeń tego dnia'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {displayDayEvents.map(ev => (
                <div key={ev.id} className="flex gap-3 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 w-10 shrink-0 pt-0.5 tabular-nums">
                    {fmtTime(ev.start_time, localeStr)}
                  </div>
                  <div className="border-l-2 pl-3 flex-1 min-w-0" style={{ borderLeftColor: SHOW_TYPES.has(ev.type ?? '') ? '#c8102e' : '#e4ddd4' }}>
                    <Link href={`/calendar?date=${eventDateParam(ev.start_time)}`}
                      className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors truncate block">
                      {ev.title}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[ev.location, `${td.until} ${fmtTime(ev.end_time, localeStr)}`].filter(Boolean).join(' · ')}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {(() => { const th = theatreLabel(ev, allTheatres, selectedTheatreId); return th ? (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{th}</span>
                      ) : null })()}
                      {ev.type && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: SHOW_TYPES.has(ev.type) ? '#fdf0f2' : '#f2ede6', color: SHOW_TYPES.has(ev.type) ? '#9e0c24' : '#5a524a' }}>
                          {ev.type}
                        </span>
                      )}
                      {ev.production_title && ev.production_title !== ev.title && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {ev.production_title}
                        </span>
                      )}
                      {ev.artist_ids.length > 0 && (
                        <span className="text-[11px] text-gray-500">{ev.artist_ids.length} os.</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Nadchodzące spektakle ────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: '#1a1410' }}>Nadchodzące spektakle</h3>
            <span className="text-xs text-gray-500">{td.upcomingDays}</span>
          </div>

          {upcomingShows.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#a89e92' }}>
              <div className="flex justify-center mb-2"><span style={{ color: '#a89e92' }}><IconCalendar size={28} /></span></div>
              <p className="text-xs">Brak nadchodzących spektakli</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingShows.map((ev, idx) => {
                const d      = new Date(ev.start_time)
                const prevD  = idx > 0 ? new Date(upcomingShows[idx-1].start_time) : null
                const newDay = !prevD || d.toDateString() !== prevD.toDateString()
                return (
                  <div key={ev.id}>
                    {newDay && (
                      <div className="flex items-center gap-3 px-5 pt-3 pb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#b8b0a4' }}>
                          {DAYS_SHORT[d.getDay()]} {d.getDate()} {MONTHS_PL[d.getMonth()].substring(0,3)}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    )}
                    <div className="flex gap-4 px-5 py-3">
                      <div className="w-10 shrink-0 pt-0.5">
                        <span className="text-xs font-semibold tabular-nums text-gray-500">
                          {fmtTime(ev.start_time, localeStr)}
                        </span>
                      </div>
                      <div className="border-l-2 pl-3 flex-1 min-w-0" style={{ borderLeftColor: '#f5c6cd' }}>
                        <Link href={`/calendar?date=${eventDateParam(ev.start_time)}`}
                          className="text-sm font-semibold leading-snug hover:underline underline-offset-2 inline-flex items-center gap-1.5 decoration-gray-400"
                          style={{ color: '#1a1410' }}>
                          {(() => { const c = catByTitle.get(ev.production_title ?? ev.title); return c ? <CategoryMarks favLevel={c.fav} hitLevel={c.hit} size={11} /> : null })()}
                          {ev.production_title ?? ev.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmtTime(ev.start_time, localeStr)}–{fmtTime(ev.end_time, localeStr)}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {(() => { const th = theatreLabel(ev, allTheatres, selectedTheatreId); return th ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{th}</span>
                          ) : null })()}
                          {(() => { const stage = stageByTitle.get(ev.production_title ?? ev.title); return stage ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={stage === 'Mała' ? { background: '#eef2ff', color: '#4338ca' } : { background: '#f2ede6', color: '#7a7068' }}>
                              {stage} Scena
                            </span>
                          ) : null })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
    </>
  )
}
