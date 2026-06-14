import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

function getAnthropicKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    const contents = fs.readFileSync(envPath, 'utf-8')
    const match = contents.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch {}
  return ''
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ────────────────────────────────────────────────────────────────────

interface Production { id: string; title: string; theatreId: string }
interface Room       { id: string; name: string;  theatreId: string }

interface DayTheatre {
  theatreId:      string
  theatreName:    string
  rooms:          Room[]
  availableProds: Production[]
}

interface DaySlot {
  date:      string
  dow:       number   // 0=Sun … 6=Sat
  isWeekend: boolean  // Fri(5) Sat(6) Sun(0)
  byTheatre: Record<string, DayTheatre>
}

interface Show {
  date:             string
  production_id:    string | null
  production_title: string
  room_id:          string | null
  room_name:        string | null
  start_time:       string
  end_time:         string
  type:             string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PL_HOLIDAYS = new Set([
  '2026-01-01','2026-01-06','2026-04-05','2026-04-06',
  '2026-05-01','2026-05-03','2026-06-04','2026-08-15',
  '2026-11-01','2026-11-11','2026-12-25','2026-12-26',
])

function getDaysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count  = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )
}

function localMonthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function extractJson(text: string): any | null {
  const stripped = text.replace(/```(?:json)?/gi, '').trim()
  try { return JSON.parse(stripped) } catch {}
  for (const src of [stripped, text]) {
    const s = src.indexOf('{'), e = src.lastIndexOf('}')
    if (s !== -1 && e > s) { try { return JSON.parse(src.slice(s, e + 1)) } catch {} }
  }
  return null
}

// ── Scheduling algorithm ──────────────────────────────────────────────────────
//
// strategy 1 — weekend-max:   all weekends (2 rooms), weekdays (1 room)
// strategy 2 — even:          every day, 1 room only
// strategy 3 — diversity-max: every day, all rooms, rotate productions maximally
// strategy 4 — balanced:      weekends (2 rooms), Tue+Thu (1 room)

const MAX_CONFLICTS = 1

function buildSchedule(
  strategy: 1 | 2 | 3 | 4,
  daySlots: DaySlot[],
  castMap: Record<string, string[]>,   // production_id → actor names
): Show[] {
  const counts: Record<string, number>     = {} // shows per production
  const lastInRoom: Record<string, string> = {} // room id → last production id
  const actorsByDate: Record<string, Set<string>> = {} // date → actors already committed
  let conflictsUsed = 0
  const result: Show[] = []

  function actorConflict(prodId: string, date: string): boolean {
    const cast = castMap[prodId] ?? []
    const busy = actorsByDate[date] ?? new Set()
    return cast.some(a => busy.has(a))
  }

  function pick(
    avail: Production[],
    usedToday: Set<string>,
    roomId: string,
    date: string,
  ): Production | null {
    const prev = lastInRoom[roomId]

    // Sort candidates by least-used first (constant across all filter levels)
    const byCount = (a: Production, b: Production) =>
      (counts[a.id] ?? 0) - (counts[b.id] ?? 0)

    // Level 1 — ideal: not used today, not yesterday, no actor conflict
    const ideal = avail.filter(p =>
      !usedToday.has(p.id) && p.id !== prev && !actorConflict(p.id, date)
    )
    if (ideal.length) return [...ideal].sort(byCount)[0]

    // Level 2 — allow yesterday's production, still no actor conflict
    const noConflict = avail.filter(p =>
      !usedToday.has(p.id) && !actorConflict(p.id, date)
    )
    if (noConflict.length) return [...noConflict].sort(byCount)[0]

    // Level 3 — use conflict budget (max 1 per whole proposal)
    if (conflictsUsed < MAX_CONFLICTS) {
      const withConflict = avail.filter(p => !usedToday.has(p.id))
      if (withConflict.length) {
        conflictsUsed++
        return [...withConflict].sort(byCount)[0]
      }
    }

    // Budget exhausted — skip this slot rather than add another conflict
    return null
  }

  // For strategy 1 sort weekends first so they get priority when filling
  const slots = strategy === 1
    ? [...daySlots].sort((a, b) => Number(b.isWeekend) - Number(a.isWeekend) || a.date.localeCompare(b.date))
    : daySlots

  for (const slot of slots) {
    actorsByDate[slot.date] ??= new Set()

    for (const [, th] of Object.entries(slot.byTheatre)) {
      if (!th.availableProds.length || !th.rooms.length) continue

      // How many rooms to fill
      let roomCount: number
      if      (strategy === 1) roomCount = slot.isWeekend ? th.rooms.length : 1
      else if (strategy === 2) roomCount = 1
      else if (strategy === 3) roomCount = th.rooms.length
      else { // 4 — balanced
        if   (slot.isWeekend)                      roomCount = th.rooms.length
        else if (slot.dow === 2 || slot.dow === 4) roomCount = 1  // Tue / Thu
        else                                       roomCount = 0
      }

      const usedToday = new Set<string>()
      for (let i = 0; i < roomCount && i < th.rooms.length; i++) {
        const room = th.rooms[i]
        const prod = pick(th.availableProds, usedToday, room.id, slot.date)
        if (!prod) continue

        result.push({
          date:             slot.date,
          production_id:    prod.id,
          production_title: prod.title,
          room_id:          room.id,
          room_name:        room.name,
          start_time:       '19:00:00',
          end_time:         '21:30:00',
          type:             'spektakl',
        })
        counts[prod.id]       = (counts[prod.id]   ?? 0) + 1
        lastInRoom[room.id]   = prod.id
        usedToday.add(prod.id)

        // Register this production's actors as committed for the day
        for (const actor of (castMap[prod.id] ?? [])) {
          actorsByDate[slot.date].add(actor)
        }
      }
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date))
}

function summarise(shows: Show[], month: string): string {
  const total = shows.length
  const days  = getDaysInMonth(month)
  const weekendDays = shows.filter(s => {
    const d = new Date(s.date + 'T12:00:00').getDay()
    return d === 0 || d === 5 || d === 6
  })
  const byProd: Record<string, number> = {}
  for (const s of shows) byProd[s.production_title] = (byProd[s.production_title] ?? 0) + 1
  const prodStr = Object.entries(byProd).map(([t, n]) => `${t}×${n}`).join(', ')
  return `${total} spektakli | weekendy: ${new Set(weekendDays.map(s => s.date)).size} dni | ${prodStr}`
}

// ── PATCH — update proposal_data (edit shows) ────────────────────────────────

export async function PATCH(request: Request) {
  const { proposalId, proposal_data } = await request.json() as {
    proposalId: string
    proposal_data: any[]
  }
  if (!proposalId) return Response.json({ error: 'Missing proposalId' }, { status: 400 })

  const byProd: Record<string, number> = {}
  for (const e of proposal_data) byProd[e.production_title] = (byProd[e.production_title] ?? 0) + 1

  const { error } = await supabase
    .from('repertoire_proposals')
    .update({ proposal_data, stats: { total: proposal_data.length, conflicts: 0, by_production: byProd } })
    .eq('id', proposalId)
    .eq('status', 'draft')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const id    = searchParams.get('id')

  if (id) {
    const { data, error } = await supabase.from('repertoire_proposals').select('*').eq('id', id).single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ proposal: data })
  }

  const status  = searchParams.get('status')
  const theatre = searchParams.get('theatre')

  let q = supabase.from('repertoire_proposals').select('*').order('created_at', { ascending: false })
  if (month)   q = (q as any).eq('month', month)
  if (status)  q = (q as any).eq('status', status)
  if (theatre) q = (q as any).eq('theatre_id', theatre)

  // For planning view (month filter, no status filter): return only the 4 most recent drafts
  if (month && !status) {
    q = (q as any).eq('status', 'draft').limit(4)
  } else {
    q = (q as any).limit(60)
  }

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ proposals: data ?? [] })
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { month, constraints, theatreId } = await request.json() as {
    month: string
    constraints?: string
    theatreId?: string
  }

  if (!month?.match(/^\d{4}-\d{2}$/)) {
    return Response.json({ error: 'Invalid month format' }, { status: 400 })
  }
  if (!theatreId) {
    return Response.json({ error: 'Wybierz teatr — repertuar planowany jest osobno dla każdego teatru.' }, { status: 400 })
  }

  const apiKey = getAnthropicKey()
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const [y, m] = month.split('-').map(Number)
  const monthStart = month + '-01'
  const monthEnd   = localMonthEnd(month)

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const [
    { data: productions },
    { data: artistProds },
    { data: artists },
    { data: rooms },
    { data: theatres },
    { data: dayStatuses },
  ] = await Promise.all([
    supabase.from('productions').select('id, title, status, theatre_id').eq('theatre_id', theatreId).order('title'),
    supabase.from('artist_productions').select('artist_id, production_id'),
    supabase.from('artists').select('id, name'),
    supabase.from('rooms').select('id, name, theatre_id').eq('theatre_id', theatreId).limit(20),
    supabase.from('theatres').select('id, name'),
    supabase.from('actor_day_status')
      .select('artist_id, date, status, artists(name)')
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ])

  // Cast map
  const castMap: Record<string, string[]> = {}
  for (const ap of (artistProds ?? []) as any[]) {
    const artist = ((artists ?? []) as any[]).find((a: any) => a.id === ap.artist_id)
    if (artist) { castMap[ap.production_id] ??= []; castMap[ap.production_id].push(artist.name) }
  }

  // Unavailability map
  const BLOCKING = new Set(['Urlop', 'Niedostępny', 'Choroba'])
  const unavailMap: Record<string, Set<string>> = {}
  for (const s of (dayStatuses ?? []) as any[]) {
    if (BLOCKING.has(s.status)) {
      const name = (Array.isArray(s.artists) ? s.artists[0] : s.artists)?.name ?? ''
      if (name) { unavailMap[s.date] ??= new Set(); unavailMap[s.date].add(name) }
    }
  }

  // Theatre name map
  const theatreNames: Record<string, string> = {}
  for (const t of (theatres ?? []) as any[]) theatreNames[t.id] = t.name

  // Active productions (with cast, per theatre)
  const activeProds: Production[] = ((productions ?? []) as any[])
    .filter(p => (castMap[p.id]?.length ?? 0) > 0)
    .map(p => ({ id: p.id, title: p.title, theatreId: p.theatre_id ?? 'unknown' }))

  // Rooms per theatre
  const roomsByTheatre: Record<string, Room[]> = {}
  for (const r of (rooms ?? []) as any[]) {
    const tid = r.theatre_id ?? 'unknown'
    roomsByTheatre[tid] ??= []
    roomsByTheatre[tid].push({ id: r.id, name: r.name, theatreId: tid })
  }

  // Fallback: if rooms have no theatre_id, assign to first production's theatre
  const allRooms: Room[] = (rooms ?? []) as any[]
  if (Object.keys(roomsByTheatre).length === 0 || (Object.keys(roomsByTheatre).length === 1 && Object.keys(roomsByTheatre)[0] === 'unknown')) {
    const firstTheatre = activeProds[0]?.theatreId ?? 'unknown'
    roomsByTheatre[firstTheatre] = allRooms.map(r => ({ ...r, theatreId: firstTheatre }))
  }

  // ── Build DaySlots ──────────────────────────────────────────────────────────
  const days = getDaysInMonth(month)

  function canPlay(prodId: string, date: string): boolean {
    const cast    = castMap[prodId] ?? []
    const blocked = unavailMap[date] ?? new Set()
    const avail   = cast.filter(n => !blocked.has(n))
    return avail.length >= Math.ceil(cast.length / 2)
  }

  // Collect all theatre IDs that have both rooms and productions
  const theatreIds = [
    ...new Set([
      ...activeProds.map(p => p.theatreId),
      ...Object.keys(roomsByTheatre),
    ])
  ].filter(tid => tid !== 'unknown' || Object.keys(roomsByTheatre).includes('unknown'))

  const daySlots: DaySlot[] = days
    .filter(d => !PL_HOLIDAYS.has(d))
    .map(d => {
      const dow       = new Date(d + 'T12:00:00').getDay()
      const byTheatre: Record<string, DayTheatre> = {}

      for (const tid of theatreIds) {
        const tRooms = roomsByTheatre[tid] ?? []
        const tProds = activeProds.filter(p => p.theatreId === tid)
        const avail  = tProds.filter(p => canPlay(p.id, d))
        if (tRooms.length > 0 && tProds.length > 0) {
          byTheatre[tid] = {
            theatreId:      tid,
            theatreName:    theatreNames[tid] ?? tid,
            rooms:          tRooms,
            availableProds: avail,
          }
        }
      }

      return {
        date:      d,
        dow,
        isWeekend: dow === 0 || dow === 5 || dow === 6,
        byTheatre,
      }
    })
    .filter(s => Object.values(s.byTheatre).some(t => t.availableProds.length > 0))

  if (daySlots.length === 0) {
    return Response.json({ error: 'Brak dostępnych terminów w tym miesiącu' }, { status: 400 })
  }

  // ── Run 4 algorithms ────────────────────────────────────────────────────────
  const [shows1, shows2, shows3, shows4] = ([1, 2, 3, 4] as const).map(s =>
    buildSchedule(s, daySlots, castMap)
  )

  const strategies = [
    { label: 'Propozycja 1', shows: shows1, hint: 'weekendy priorytet, obie sale' },
    { label: 'Propozycja 2', shows: shows2, hint: 'równomierny rozkład, 1 sala/dzień' },
    { label: 'Propozycja 3', shows: shows3, hint: 'max różnorodność, wszystkie sale' },
    { label: 'Propozycja 4', shows: shows4, hint: 'weekendy + wt/czw' },
  ]

  // ── Claude: descriptions only (~50 tokens output) ──────────────────────────
  const [yearN, monthN] = month.split('-').map(Number)
  const monthName = new Date(yearN, monthN - 1, 1)
    .toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })

  const summaryLines = strategies.map((s, i) =>
    `Propozycja ${i + 1} (${s.hint}): ${summarise(s.shows, month)}`
  ).join('\n')

  const descPrompt = `Napisz PO JEDNYM krótkim zdaniu po polsku opisującym strategię każdej propozycji repertuaru na ${monthName}:

${summaryLines}

${constraints ? `Życzenia koordynatora: ${constraints}\n` : ''}Odpowiedz TYLKO minimalnym JSON bez spacji: {"d":["opis1","opis2","opis3","opis4"]}`

  let descriptions = ['', '', '', '']
  try {
    const anthropic = new Anthropic({ apiKey })
    const res  = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 400,
      messages:   [{ role: 'user', content: descPrompt }],
    })
    const text   = res.content[0].type === 'text' ? res.content[0].text : ''
    const parsed = extractJson(text)
    if (parsed?.d?.length === 4) descriptions = parsed.d
  } catch {
    // Descriptions are nice-to-have — don't fail the whole request
  }

  // ── Save to DB ──────────────────────────────────────────────────────────────

  function countConflicts(shows: Show[]): number {
    const byDate: Record<string, Show[]> = {}
    for (const s of shows) { byDate[s.date] ??= []; byDate[s.date].push(s) }
    let conflicts = 0
    for (const dayShows of Object.values(byDate)) {
      if (dayShows.length < 2) continue
      const checked = new Set<string>()
      for (let i = 0; i < dayShows.length; i++) {
        for (let j = i + 1; j < dayShows.length; j++) {
          const castA = new Set(castMap[dayShows[i].production_id ?? ''] ?? [])
          const castB = castMap[dayShows[j].production_id ?? ''] ?? []
          if (castB.some(a => castA.has(a))) {
            if (!checked.has(dayShows[i].production_id ?? '')) { conflicts++; checked.add(dayShows[i].production_id ?? '') }
            if (!checked.has(dayShows[j].production_id ?? '')) { conflicts++; checked.add(dayShows[j].production_id ?? '') }
          }
        }
      }
    }
    return conflicts
  }

  const toInsert = strategies.map((s, i) => {
    const byProd: Record<string, number> = {}
    for (const e of s.shows) byProd[e.production_title] = (byProd[e.production_title] ?? 0) + 1
    return {
      month,
      theatre_id:    theatreId,
      label:         s.label,
      status:        'draft',
      proposal_data: s.shows,
      reasoning:     descriptions[i] || s.hint,
      stats:         { total: s.shows.length, conflicts: countConflicts(s.shows), by_production: byProd },
    }
  })

  // Usuń poprzednie drafty tego miesiąca dla tego teatru
  await supabase.from('repertoire_proposals').delete()
    .eq('month', month).eq('status', 'draft').eq('theatre_id', theatreId)

  const { data: saved, error: dbErr } = await supabase
    .from('repertoire_proposals')
    .insert(toInsert)
    .select()

  if (dbErr) return Response.json({ error: dbErr.message }, { status: 500 })
  return Response.json({ proposals: saved })
}
