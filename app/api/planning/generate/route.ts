import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import {
  profileFor, VARIANTS, buildSlots, prevDate, changeoverOk,
  type Variant, type Profile,
} from '@/lib/repertoire-base'
import { scenesForTheatre, mapRoomsToScenes } from '@/lib/finance'
import { sessionOrgId } from '@/lib/session-org'

type StageKey = string  // klucz sceny (2 sceny Fundacji lub 3 sceny TD)

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
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ────────────────────────────────────────────────────────────────────

interface Production { id: string; title: string; theatreId: string; stage: StageKey; setup: number; teardown: number }
interface Room       { id: string; name: string;  theatreId: string }

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

// ── BAZOWY WZORZEC — wypełnianie slotów tytułami (rotacja + bloki) ────────────
// Kształt (kiedy/ile spektakli) pochodzi z lib/repertoire-base (buildSlots),
// wyprowadzonego z analizy realnych repertuarów Polonia/Och. Tu dobieramy TYTUŁY:
// bloki 2 kolejnych dni, potem rotacja najdłużej nieobecnego, twarde konflikty.

function buildSchedule(
  variant:    Variant,
  month:      string,
  prods:      Production[],
  castMap:    Record<string, string[]>,
  unavailMap: Record<string, Set<string>>,
  profile:    Profile,
  stageRoom:  (stage: StageKey) => Room | null,
  rentedStageByDate: Record<string, Set<string>> = {},
  dublerMap:  Record<string, string[]> = {},   // production_id -> nazwiska dublerów
): Show[] {
  const slots = buildSlots(variant, month, profile)

  const canPlay = (pid: string, date: string) => {
    const c = castMap[pid] ?? []; const b = unavailMap[date] ?? new Set<string>()
    return c.filter(a => !b.has(a)).length >= Math.ceil(c.length / 2)
  }

  const lastDate: Record<string, string> = {}
  const runLen:   Record<string, number> = {}
  const count:    Record<string, number> = {}
  const todaysActors: Record<string, Set<string>> = {}
  const todaysStandby: Record<string, Set<string>> = {}   // dublerzy w gotowości danego dnia
  const todaysTitles: Record<string, Set<string>> = {}
  // Stan sceny (montaż/demontaż): ostatni tytuł na scenie i jego demontaż.
  // Klucz = dowolny `stage` — mapa dynamiczna (2 sceny Fundacji lub 3 sceny TD).
  const stageState: Record<string, { date: string; title: string; teardown: number } | undefined> = {}
  const result: Show[] = []

  for (const s of slots) {
    todaysActors[s.date] ??= new Set()
    todaysStandby[s.date] ??= new Set()
    todaysTitles[s.date] ??= new Set()
    const yd = prevDate(s.date)
    // Konflikt: wspólny aktor z granym już dziś tytułem, LUB obsada na standby jako
    // dubler, LUB dubler tego tytułu już gra dziś (musiałby być w gotowości i grać).
    const conflict = (pid: string) => {
      const cast = castMap[pid] ?? []
      if (cast.some(a => todaysActors[s.date].has(a) || todaysStandby[s.date].has(a))) return true
      if ((dublerMap[pid] ?? []).some(a => todaysActors[s.date].has(a))) return true
      return false
    }
    // Scena wolna: ten sam tytuł kontynuuje (bez zmiany scenografii) albo minął
    // demontaż poprzedniego + montaż nowego (dni robocze).
    const stageFree = (p: Production) => {
      const st = stageState[p.stage]
      if (!st) return true
      // Kontynuacja bloku (ten sam tytuł, kolejny dzień) — scenografia stoi, bez changeover.
      if (st.title === p.id && st.date === yd) return true
      // Inaczej (inny tytuł albo powrót po przerwie) — musi minąć demontaż + montaż.
      return changeoverOk({ date: st.date, teardown: st.teardown }, s.date, p.setup)
    }

    // Kandydaci: mogą grać, nie grają już dziś, brak konfliktu, scena wolna, blok < limit.
    const elig = prods.filter(p =>
      canPlay(p.id, s.date) && !todaysTitles[s.date].has(p.id) && !conflict(p.id) && stageFree(p) &&
      !(rentedStageByDate[s.date]?.has(p.stage)) &&    // scena zablokowana wynajmem
      !(lastDate[p.id] === yd && (runLen[p.id] ?? 0) >= variant.block))
    if (!elig.length) continue

    // Priorytet 1: kontynuacja bloku (grał wczoraj, blok < variant.block).
    const cont = elig.filter(p => lastDate[p.id] === yd && (runLen[p.id] ?? 0) < variant.block)
    let chosen: Production
    if (cont.length) {
      cont.sort((a, b) => (runLen[a.id] ?? 0) - (runLen[b.id] ?? 0) || (count[a.id] ?? 0) - (count[b.id] ?? 0))
      chosen = cont[0]
    } else {
      // Priorytet 2: najdłużej nieobecny tytuł (rozkłada granie), potem najmniej grany.
      const gap = (p: Production) => lastDate[p.id]
        ? (new Date(s.date).getTime() - new Date(lastDate[p.id]).getTime()) / 864e5 : 9999
      elig.sort((a, b) => gap(b) - gap(a) || (count[a.id] ?? 0) - (count[b.id] ?? 0))
      chosen = elig[0]
    }

    const room = stageRoom(chosen.stage)
    result.push({
      date: s.date, production_id: chosen.id, production_title: chosen.title,
      room_id: room?.id ?? null, room_name: room?.name ?? null,
      start_time: s.start, end_time: s.end, type: 'spektakl',
    })
    runLen[chosen.id] = (lastDate[chosen.id] === yd ? (runLen[chosen.id] ?? 0) : 0) + 1
    lastDate[chosen.id] = s.date
    count[chosen.id] = (count[chosen.id] ?? 0) + 1
    stageState[chosen.stage] = { date: s.date, title: chosen.id, teardown: chosen.teardown }
    todaysTitles[s.date].add(chosen.id)
    for (const a of (castMap[chosen.id] ?? [])) todaysActors[s.date].add(a)
    for (const a of (dublerMap[chosen.id] ?? [])) todaysStandby[s.date].add(a)
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
}

function summarise(shows: Show[]): string {
  const total = shows.length
  const weekendDays = shows.filter(s => {
    const d = new Date(s.date + 'T12:00:00').getDay()
    return d === 0 || d === 5 || d === 6
  })
  const matinees = shows.filter(s => s.start_time < '17:00:00').length
  const byProd: Record<string, number> = {}
  for (const s of shows) byProd[s.production_title] = (byProd[s.production_title] ?? 0) + 1
  const prodStr = Object.entries(byProd).map(([t, n]) => `${t}×${n}`).join(', ')
  return `${total} spektakli | weekendy: ${new Set(weekendDays.map(s => s.date)).size} dni | poranki: ${matinees} | ${prodStr}`
}

// ── PATCH — update proposal_data (edit shows) ────────────────────────────────

export async function PATCH(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

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
    .eq('org_id', orgId)
    .eq('id', proposalId)
    .eq('status', 'draft')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const id    = searchParams.get('id')

  if (id) {
    const { data, error } = await supabase.from('repertoire_proposals').select('*').eq('org_id', orgId).eq('id', id).single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ proposal: data })
  }

  const status  = searchParams.get('status')
  const theatre = searchParams.get('theatre')

  let q = supabase.from('repertoire_proposals').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
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

  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const monthStart = month + '-01'
  const monthEnd   = localMonthEnd(month)

  // ── Fetch data (scope: org) ──────────────────────────────────────────────────
  const [
    { data: productions },
    { data: artistProds },
    { data: artists },
    { data: rooms },
    { data: theatres },
    { data: dayStatuses },
  ] = await Promise.all([
    (async () => {
      // Tolerancyjnie na brak migracji stage / setup-teardown — każda kolumna niezależnie.
      const q = (cols: string) => supabase.from('productions').select(cols).eq('org_id', orgId).eq('theatre_id', theatreId).order('title')
      let r = await q('id, title, status, theatre_id, stage, setup_days, teardown_days')
      if (r.error) r = await q('id, title, status, theatre_id, setup_days, teardown_days')
      if (r.error) r = await q('id, title, status, theatre_id, stage')
      if (r.error) r = await q('id, title, status, theatre_id')
      return r
    })(),
    supabase.from('artist_productions').select('artist_id, production_id').eq('org_id', orgId),
    supabase.from('artists').select('id, name').eq('org_id', orgId),
    supabase.from('rooms').select('id, name, theatre_id').eq('org_id', orgId).eq('theatre_id', theatreId).limit(20),
    supabase.from('theatres').select('id, name').eq('org_id', orgId),
    supabase.from('actor_day_status')
      .select('artist_id, date, status, artists(name)')
      .eq('org_id', orgId)
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ])

  // Cast map
  const castMap: Record<string, string[]> = {}
  for (const ap of (artistProds ?? []) as any[]) {
    const artist = ((artists ?? []) as any[]).find((a: any) => a.id === ap.artist_id)
    if (artist) { castMap[ap.production_id] ??= []; castMap[ap.production_id].push(artist.name) }
  }

  // Dublerzy per produkcja (nazwiska) — gotowość gdy tytuł grany danego dnia
  const nameById: Record<string, string> = {}
  for (const a of (artists ?? []) as any[]) nameById[a.id] = a.name
  const { data: subRows } = await supabase.from('actor_production_substitutes')
    .select('production_id, substitute_id').eq('org_id', orgId)
  const dublerMap: Record<string, string[]> = {}
  for (const r of (subRows ?? []) as any[]) { const n = nameById[r.substitute_id]; if (n) (dublerMap[r.production_id] ??= []).push(n) }

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

  // Active productions (with cast) for this theatre
  const activeProds: Production[] = ((productions ?? []) as any[])
    .filter(p => (castMap[p.id]?.length ?? 0) > 0)
    .map(p => ({
      id: p.id, title: p.title, theatreId: p.theatre_id ?? theatreId,
      stage: (p.stage ?? 'duza') as StageKey,
      setup: p.setup_days ?? 0, teardown: p.teardown_days ?? 0,
    }))

  if (activeProds.length === 0) {
    return Response.json({ error: 'Brak aktywnych tytułów z obsadą dla tego teatru' }, { status: 400 })
  }

  // Sale wg sceny — montaż/demontaż liczony osobno per scena (2 Fundacja / 3 TD).
  const roomById: Record<string, Room> = {}
  for (const r of (rooms ?? []) as any[]) roomById[r.id] = { id: r.id, name: r.name, theatreId }
  const sceneRoomIds = mapRoomsToScenes(scenesForTheatre(theatreId), (rooms ?? []) as any[])
  const firstRoom: Room | null = ((rooms ?? []) as any[])[0]
    ? { id: (rooms as any[])[0].id, name: (rooms as any[])[0].name, theatreId } : null
  const stageRoom = (stage: StageKey): Room | null => {
    const rid = sceneRoomIds[stage]
    return (rid ? roomById[rid] : null) ?? firstRoom
  }

  // Wynajem sceny — blokuje scenę na dany dzień (auto-repertuar ją omija)
  const stageByRoomId: Record<string, string> = {}
  for (const [stg, rid] of Object.entries(sceneRoomIds)) if (rid) stageByRoomId[rid] = stg
  const { data: rentals } = await supabase.from('events')
    .select('room_id, start_time').eq('org_id', orgId).eq('theatre_id', theatreId).eq('type', 'Wynajem sceny')
    .gte('start_time', `${monthStart}T00:00:00`).lte('start_time', `${monthEnd}T23:59:59`)
  const rentedStageByDate: Record<string, Set<string>> = {}
  for (const r of (rentals ?? []) as any[]) {
    const stg = r.room_id ? stageByRoomId[r.room_id] : null
    if (!stg) continue
    ;(rentedStageByDate[String(r.start_time).slice(0, 10)] ??= new Set()).add(stg)
  }

  // ── Bazowy wzorzec: 4 warianty wokół realnego profilu teatru ─────────────────
  const profile = profileFor(theatreNames[theatreId] ?? '')
  const strategies = VARIANTS.map(v => ({
    label: v.label,
    shows: buildSchedule(v, month, activeProds, castMap, unavailMap, profile, stageRoom, rentedStageByDate, dublerMap),
    hint:  v.hint,
  }))

  // ── Claude: descriptions only (~50 tokens output) ──────────────────────────
  const [yearN, monthN] = month.split('-').map(Number)
  const monthName = new Date(yearN, monthN - 1, 1)
    .toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })

  const summaryLines = strategies.map((s, i) =>
    `Propozycja ${i + 1} (${s.hint}): ${summarise(s.shows)}`
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
      org_id:        orgId,
      month,
      theatre_id:    theatreId,
      label:         s.label,
      status:        'draft',
      proposal_data: s.shows,
      reasoning:     descriptions[i] || s.hint,
      stats:         { total: s.shows.length, conflicts: countConflicts(s.shows), by_production: byProd },
    }
  })

  // Usuń poprzednie drafty tego miesiąca dla tego teatru (w ramach org)
  await supabase.from('repertoire_proposals').delete()
    .eq('org_id', orgId).eq('month', month).eq('status', 'draft').eq('theatre_id', theatreId)

  const { data: saved, error: dbErr } = await supabase
    .from('repertoire_proposals')
    .insert(toInsert)
    .select()

  if (dbErr) return Response.json({ error: dbErr.message }, { status: 500 })
  return Response.json({ proposals: saved })
}
