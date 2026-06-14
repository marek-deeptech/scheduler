// Test: planowanie osobno per teatr + zajętość krzyżowa wspólnych aktorów.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const API = 'http://localhost:3000'
const POLONIA = '96187687-13eb-4b49-ab60-cc587f58119e'
const OCH = '8ea01433-7d8b-4710-aba3-b5dcd567eb57'
const MONTH = '2027-05'
const LOCKED = ['2027-05-08', '2027-05-09', '2027-05-15', '2027-05-16'] // soboty/niedziele
const log = (...a) => console.log(...a)
const ok = (c, m) => log(`  ${c ? '✅' : '❌'} ${m}`)
const made = { slot: null }

async function gen(theatreId) {
  const r = await fetch(`${API}/api/planning/generate-options`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: MONTH, theatreId }),
  })
  return r.json()
}

async function run() {
  // Mapy: produkcja -> teatr, produkcja -> obsada
  const { data: prods } = await sb.from('productions').select('id, title, theatre_id')
  const prodTheatre = {}, prodTitle = {}
  for (const p of prods) { prodTheatre[p.id] = p.theatre_id; prodTitle[p.id] = p.title }
  const { data: aps } = await sb.from('artist_productions').select('artist_id, production_id')
  const castByProd = {}, theatresByArtist = {}
  for (const a of aps) {
    (castByProd[a.production_id] ??= []).push(a.artist_id)
    const th = prodTheatre[a.production_id]
    if (th) (theatresByArtist[a.artist_id] ??= new Set()).add(th)
  }
  // Wspólny aktor (gra w obu) + jego produkcja w Polonii
  const shared = Object.keys(theatresByArtist).find(a => theatresByArtist[a].has(POLONIA) && theatresByArtist[a].has(OCH))
  const polProd = aps.find(a => a.artist_id === shared && prodTheatre[a.production_id] === POLONIA)
  const { data: artistRow } = await sb.from('artists').select('name').eq('id', shared).single()
  log(`\n━━━ SETUP ━━━`)
  log(`  Wspólny aktor: ${artistRow.name}`)
  log(`  Jego tytuł w Polonii: „${prodTitle[polProd.production_id]}" — zablokowany na ${LOCKED.join(', ')}`)

  // Zablokowany slot w Polonii (zajętość)
  const { data: slot } = await sb.from('repertoire_slots').insert({
    month: MONTH, production_id: polProd.production_id, window_start: LOCKED[0], window_end: LOCKED.at(-1),
    target_performances: LOCKED.length, status: 'planned', locked_dates: LOCKED,
  }).select('id').single()
  made.slot = slot.id

  // 1. Generuj Polonię
  log(`\n━━━ GENEROWANIE — POLONIA ━━━`)
  const pol = await gen(POLONIA)
  ok(pol.ok && pol.options?.length === 4, `4 opcje Polonii (locked: ${pol.lockedCount})`)
  const { data: polProps } = await sb.from('repertoire_proposals').select('proposal_data').eq('month', MONTH).eq('theatre_id', POLONIA).eq('status', 'draft')
  const polEvents = polProps.flatMap(p => p.proposal_data)
  ok(polEvents.every(e => prodTheatre[e.production_id] === POLONIA), `Wszystkie ${polEvents.length} spektakli to produkcje Polonii`)

  // 2. Generuj Och
  log(`\n━━━ GENEROWANIE — OCH ━━━`)
  const och = await gen(OCH)
  ok(och.ok && och.options?.length === 4, `4 opcje Och`)
  const { data: ochProps } = await sb.from('repertoire_proposals').select('proposal_data').eq('month', MONTH).eq('theatre_id', OCH).eq('status', 'draft')
  const ochEvents = ochProps.flatMap(p => p.proposal_data)
  ok(ochEvents.every(e => prodTheatre[e.production_id] === OCH), `Wszystkie ${ochEvents.length} spektakli to produkcje Och`)

  // 3. Zajętość krzyżowa: wspólny aktor NIE zaplanowany w Och w dniach zablokowanych w Polonii
  log(`\n━━━ ZAJĘTOŚĆ KRZYŻOWA ━━━`)
  const conflicts = ochEvents.filter(e =>
    LOCKED.includes(e.date) && (castByProd[e.production_id] ?? []).includes(shared)
  )
  ok(conflicts.length === 0, `Wspólny aktor nie jest dublowany w Och w dniach zajętości Polonii (kolizje: ${conflicts.length})`)
  if (conflicts.length) conflicts.forEach(c => log(`     ✗ ${c.date} ${prodTitle[c.production_id]}`))
}

async function cleanup() {
  log(`\n━━━ CLEANUP ━━━`)
  await sb.from('repertoire_proposals').delete().eq('month', MONTH).eq('status', 'draft')
  if (made.slot) await sb.from('repertoire_slots').delete().eq('id', made.slot)
  log('  Fixture usunięty.')
}

try { await run() } catch (e) { log('\n❌ BŁĄD:', e?.message ?? e) } finally { await cleanup(); log('\n✓ Test zakończony.') }
