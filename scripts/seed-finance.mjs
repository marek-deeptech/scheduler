// Zasila parametry finansowe realnymi danymi (cenniki Polonia/Och 2026).
// Uruchom PO migracji: node scripts/seed-finance.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const POLONIA = '96187687-13eb-4b49-ab60-cc587f58119e'
const OCH     = '8ea01433-7d8b-4710-aba3-b5dcd567eb57'

// Ceny per kategoria (blended ze stref cennika)
const CAT = {
  premium:  { normal: 142, reduced: 128, last_minute: 50 },
  standard: { normal: 117, reduced: 105, last_minute: 35 },
  mala:     { normal: 80,  reduced: 72,  last_minute: 35 },
}

async function main() {
  // 1. Pojemności sal
  const { data: rooms } = await sb.from('rooms').select('id, name, theatre_id')
  let roomCount = 0
  for (const r of rooms ?? []) {
    const n = (r.name ?? '').toLowerCase()
    let cap = 200
    if (r.theatre_id === POLONIA) cap = n.includes('mała') || n.includes('mala') ? 90 : 266
    else if (r.theatre_id === OCH) cap = n.includes('cafe') ? 100 : 450
    const { error } = await sb.from('rooms').update({ capacity: cap }).eq('id', r.id)
    if (!error) { roomCount++; console.log(`  Sala „${r.name}" → ${cap} miejsc`) }
    else { console.error('  Błąd (czy migracja uruchomiona?):', error.message); return }
  }

  // 2. Kategoria + ceny per produkcja (wg sceny, na której najczęściej grana)
  const { data: prods } = await sb.from('productions').select('id, title, theatre_id, location_type')
  // ustal scenę produkcji po wydarzeniach
  const { data: evs } = await sb.from('events').select('production_id, room_id, rooms(name)')
  const roomByProd = {}
  for (const e of evs ?? []) {
    if (!e.production_id || roomByProd[e.production_id]) continue
    const rm = Array.isArray(e.rooms) ? e.rooms[0] : e.rooms
    roomByProd[e.production_id] = (rm?.name ?? '').toLowerCase()
  }
  let prodCount = 0
  for (const p of prods ?? []) {
    const roomName = roomByProd[p.id] ?? ''
    const cat = roomName.includes('mała') || roomName.includes('mala') || roomName.includes('cafe')
      ? 'mala' : 'standard' // Premium ustaw ręcznie dla wybranych tytułów
    const prices = CAT[cat]
    const { error } = await sb.from('productions').update({
      price_category: cat,
      price_normal: prices.normal,
      price_reduced: prices.reduced,
      price_last_minute: prices.last_minute,
      assumed_attendance: 0.75,
      fixed_cost: 8000,
    }).eq('id', p.id)
    if (!error) prodCount++
    else { console.error('  Błąd produkcji:', error.message); return }
  }

  console.log(`\n✓ Zasilono: ${roomCount} sal, ${prodCount} produkcji.`)
  console.log('  (Kategorię Premium i koszt ryczałtowy ustaw ręcznie dla wybranych tytułów.)')
}

main().catch(e => console.error(e))
