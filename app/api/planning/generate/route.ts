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
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ────────────────────────────────────────────────────────────────────

interface Production { id: string; title: string; theatreId: string }
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

// Święta — repertuar JE OBEJMUJE (analiza realnych repertuarów: teatry grają w
// święta). Trzymamy listę tylko informacyjnie; nie wykluczamy tych dni.
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

function prevDate(date: string): string {
  const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1)
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

// ── BAZOWY WZORZEC GENEROWANIA ───────────────────────────────────────────────
// Wyprowadzony z analizy realnych repertuarów Teatru Polonia i Och-Teatru
// (IV 2025 – X 2026, 1437 spektakli). Kluczowe wzorce:
//  • grają NIEMAL CODZIENNIE 1 wieczorny spektakl 19:00; poniedziałek najlżejszy
//  • weekendowe poranki/popołudnia (głównie niedziela) → dni z 2 spektaklami;
//    Och dodatkowo sporadyczne poranki 12:00 w tygodniu (szkolne)
//  • tytuły grane w BLOKACH 2 kolejnych dni, potem przerwa ~3–4 tygodnie
//  • gęstość: Polonia ~28 spektakli/mies, Och ~35; ~14 tytułów × ~2 grania
//  • grają w święta; rytm stabilny cały rok
// To jest BAZA — finanse / założenia dodatkowe / sloty Favourites modyfikują ją.

interface Profile {
  key:             string
  eveningTarget:   number              // ile dni z wieczornym spektaklem (reszta = ciemne)
  matSun:          number              // odsetek niedziel z dodatkowym porankiem
  matSat:          number              // odsetek sobót z porankiem
  matWeekday:      number              // odsetek dni roboczych z porankiem (Och: 12:00 szkolne)
  matWeekendTime:  [string, string]
  matWeekdayTime:  [string, string]
}

function profileFor(name: string): Profile {
  const n = (name || '').toLowerCase()
  if (n.includes('och'))
    return { key: 'Och', eveningTarget: 28, matSun: 0.50, matSat: 0.45, matWeekday: 0.14,
             matWeekendTime: ['16:00:00', '18:00:00'], matWeekdayTime: ['12:00:00', '14:00:00'] }
  // Domyślnie profil typu „Polonia" (jedna duża scena, mniej poranków)
  return { key: 'Polonia', eveningTarget: 26, matSun: 0.45, matSat: 0.20, matWeekday: 0,
           matWeekendTime: ['16:00:00', '18:00:00'], matWeekdayTime: ['12:00:00', '14:00:00'] }
}

// Waga dnia tygodnia (0=Ndz … 6=Sob): pn najlżej, ndz najciężej — z rozkładu realnego.
const DOW_W: Record<number, number> = { 0: 1.05, 1: 0.78, 2: 0.92, 3: 0.92, 4: 0.90, 5: 0.95, 6: 1.0 }

interface Variant { label: string; dEve: number; matMul: number; block: number; hint: string }
const VARIANTS: Variant[] = [
  { label: 'Propozycja 1', dEve:  0, matMul: 1.0, block: 2, hint: 'bazowy wzorzec — realny rytm grania' },
  { label: 'Propozycja 2', dEve: -2, matMul: 0.6, block: 2, hint: 'lżejszy miesiąc' },
  { label: 'Propozycja 3', dEve: +1, matMul: 1.4, block: 2, hint: 'gęstszy — więcej weekendowych poranków' },
  { label: 'Propozycja 4', dEve:  0, matMul: 1.0, block: 1, hint: 'większa różnorodność tytułów' },
]

// Wybierz k elementów równomiernie rozłożonych po liście (deterministycznie).
function pickEvenly(arr: string[], k: number): Set<string> {
  if (k <= 0) return new Set()
  if (k >= arr.length) return new Set(arr)
  const out = new Set<string>(); const step = arr.length / k
  for (let i = 0; i < k; i++) out.add(arr[Math.floor(i * step + step / 2)])
  return out
}

function buildSchedule(
  variant:    Variant,
  month:      string,
  prods:      Production[],
  castMap:    Record<string, string[]>,
  unavailMap: Record<string, Set<string>>,
  profile:    Profile,
  room:       Room | null,
): Show[] {
  const days = getDaysInMonth(month).map(d => ({ date: d, dow: new Date(d + 'T12:00:00').getDay() }))
  const eveningTarget = Math.max(1, profile.eveningTarget + variant.dEve)

  // Dni ciemne: tyle dni o najniższej wadze, by zostało ~eveningTarget dni grania.
  // Jitter wg kolejności wystąpienia dnia tygodnia rozkłada ciemne dni (nie zeruje
  // całego dnia tygodnia) — poniedziałki wypadają najczęściej, ale nie wszystkie.
  const darkCount = Math.max(0, days.length - eveningTarget)
  const occ: Record<number, number> = {}
  const scored = days.map(d => {
    occ[d.dow] = (occ[d.dow] || 0) + 1
    return { date: d.date, s: (DOW_W[d.dow] ?? 0.9) + (occ[d.dow] - 1) * 0.5 }
  })
  scored.sort((a, b) => a.s - b.s || a.date.localeCompare(b.date))
  const dark = new Set(scored.slice(0, darkCount).map(d => d.date))

  // Poranki/popołudnia (dni z 2 spektaklami): weekend (ndz > sob) + Och w tygodniu.
  const sundays   = days.filter(d => d.dow === 0 && !dark.has(d.date)).map(d => d.date)
  const saturdays = days.filter(d => d.dow === 6 && !dark.has(d.date)).map(d => d.date)
  const weekdays  = days.filter(d => d.dow >= 1 && d.dow <= 5 && !dark.has(d.date)).map(d => d.date)
  const matDays = new Map<string, [string, string]>()
  for (const d of pickEvenly(sundays,   Math.round(sundays.length   * profile.matSun     * variant.matMul))) matDays.set(d, profile.matWeekendTime)
  for (const d of pickEvenly(saturdays, Math.round(saturdays.length * profile.matSat     * variant.matMul))) matDays.set(d, profile.matWeekendTime)
  if (profile.matWeekday > 0)
    for (const d of pickEvenly(weekdays, Math.round(weekdays.length  * profile.matWeekday * variant.matMul)))
      if (!matDays.has(d)) matDays.set(d, profile.matWeekdayTime)

  // Sloty chronologicznie: poranek (jeśli jest) przed wieczorem.
  const slots: { date: string; dow: number; start: string; end: string }[] = []
  for (const d of days) {
    if (dark.has(d.date)) continue
    const mt = matDays.get(d.date)
    if (mt) slots.push({ date: d.date, dow: d.dow, start: mt[0], end: mt[1] })
    slots.push({ date: d.date, dow: d.dow, start: '19:00:00', end: '21:30:00' })
  }

  // Połowa obsady dostępna = tytuł może grać danego dnia.
  const canPlay = (pid: string, date: string) => {
    const c = castMap[pid] ?? []; const b = unavailMap[date] ?? new Set<string>()
    return c.filter(a => !b.has(a)).length >= Math.ceil(c.length / 2)
  }

  const lastDate: Record<string, string> = {}
  const runLen:   Record<string, number> = {}
  const count:    Record<string, number> = {}
  const todaysActors: Record<string, Set<string>> = {}
  const todaysTitles: Record<string, Set<string>> = {}
  const result: Show[] = []

  for (const s of slots) {
    todaysActors[s.date] ??= new Set()
    todaysTitles[s.date] ??= new Set()
    const yd = prevDate(s.date)
    const conflict = (pid: string) => (castMap[pid] ?? []).some(a => todaysActors[s.date].has(a))

    // Kandydaci: mogą grać, nie grają już dziś, brak konfliktu obsady (twardo).
    const elig = prods.filter(p => canPlay(p.id, s.date) && !todaysTitles[s.date].has(p.id) && !conflict(p.id))
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

    result.push({
      date: s.date, production_id: chosen.id, production_title: chosen.title,
      room_id: room?.id ?? null, room_name: room?.name ?? null,
      start_time: s.start, end_time: s.end, type: 'spektakl',
    })
    runLen[chosen.id] = (lastDate[chosen.id] === yd ? (runLen[chosen.id] ?? 0) : 0) + 1
    lastDate[chosen.id] = s.date
    count[chosen.id] = (count[chosen.id] ?? 0) + 1
    todaysTitles[s.date].add(chosen.id)
    for (const a of (castMap[chosen.id] ?? [])) todaysActors[s.date].add(a)
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
}

function summarise(shows: Show[], month: string): string {
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

  // Active productions (with cast) for this theatre
  const activeProds: Production[] = ((productions ?? []) as any[])
    .filter(p => (castMap[p.id]?.length ?? 0) > 0)
    .map(p => ({ id: p.id, title: p.title, theatreId: p.theatre_id ?? theatreId }))

  if (activeProds.length === 0) {
    return Response.json({ error: 'Brak aktywnych tytułów z obsadą dla tego teatru' }, { status: 400 })
  }

  // Główna scena teatru (do przypisania spektaklom)
  const mainRoom: Room | null = ((rooms ?? []) as any[])[0]
    ? { id: (rooms as any[])[0].id, name: (rooms as any[])[0].name, theatreId }
    : null

  // ── Bazowy wzorzec: 4 warianty wokół realnego profilu teatru ─────────────────
  const profile = profileFor(theatreNames[theatreId] ?? '')
  const strategies = VARIANTS.map(v => ({
    label: v.label,
    shows: buildSchedule(v, month, activeProds, castMap, unavailMap, profile, mainRoom),
    hint:  v.hint,
  }))

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
