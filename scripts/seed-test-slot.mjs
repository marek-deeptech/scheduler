// Zasila testowy slot + odpowiedzi aktorów do weryfikacji heatmapy w przeglądarce.
// Po weryfikacji: node scripts/seed-test-slot.mjs --clean
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const MONTH = '2026-08', WS = '2026-08-01', WE = '2026-08-12', TARGET = 4

function windowDates(s, e) { const out = []; const d = new Date(s + 'T12:00:00'); const last = new Date(e + 'T12:00:00'); while (d <= last) { out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); d.setDate(d.getDate()+1) } return out }

if (process.argv.includes('--clean')) {
  const { data: slots } = await sb.from('repertoire_slots').select('id').eq('month', MONTH)
  for (const s of slots ?? []) {
    await sb.from('slot_availability').delete().eq('slot_id', s.id)
    await sb.from('slot_invites').delete().eq('slot_id', s.id)
    await sb.from('repertoire_slots').delete().eq('id', s.id)
  }
  console.log(`Wyczyszczono ${slots?.length ?? 0} slot(ów) z ${MONTH}.`)
  process.exit(0)
}

const { data: favs } = await sb.from('productions').select('id, title, theatre_id, artist_productions(artists(id, name))').eq('is_favourite', true)
const fav = (favs ?? []).map(p => ({ id: p.id, title: p.title, theatre_id: p.theatre_id, cast: (p.artist_productions ?? []).map(ap => Array.isArray(ap.artists) ? ap.artists[0] : ap.artists).filter(Boolean) })).filter(f => f.cast.length >= 3)[0]
if (!fav) { console.error('Brak Favourite z >=3 obsadą'); process.exit(1) }

const { data: slot } = await sb.from('repertoire_slots').insert({ month: MONTH, production_id: fav.id, window_start: WS, window_end: WE, target_performances: TARGET, status: 'collecting' }).select('id').single()

const dates = windowDates(WS, WE)
const ranges = [['2026-08-06','2026-08-12'], ['2026-08-02','2026-08-10'], ['2026-08-04','2026-08-10']]
await sb.from('slot_invites').insert(fav.cast.map(c => ({ slot_id: slot.id, artist_id: c.id, token: randomUUID(), submitted_at: new Date().toISOString() })))
const rows = []
fav.cast.forEach((c, i) => { const r = ranges[i]; for (const d of dates) rows.push({ slot_id: slot.id, artist_id: c.id, date: d, available: r ? (d >= r[0] && d <= r[1]) : true }) })
await sb.from('slot_availability').insert(rows)

console.log(`✓ Slot testowy: „${fav.title}" (${fav.cast.length} obsady), okno ${WS}–${WE}, target ${TARGET}`)
console.log(`  theatre_id: ${fav.theatre_id}`)
fav.cast.forEach((c, i) => console.log(`  ${c.name}: ${ranges[i] ? ranges[i].join('–') : 'cały okres'}`))
console.log(`  Wspólne okno (pełna obsada): 6–10 sie → oczekiwana sugestia 4 dni z tego zakresu`)
