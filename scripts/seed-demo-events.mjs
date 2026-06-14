// Seeduje 1-2 wydarzenia nie-spektaklowe dziennie przez 4 tygodnie (na prezentację).
// Pokazuje różnicę panel Wydarzenia vs Spektakle na Pulpicie.
// Czyszczenie: node scripts/seed-demo-events.mjs --clean
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const TAG = 'demo-prezentacja'

if (process.argv.includes('--clean')) {
  const { data } = await sb.from('events').delete().eq('description', TAG).select('id')
  console.log(`Usunięto ${data?.length ?? 0} wydarzeń demo.`)
  process.exit(0)
}

// Typy nie-spektaklowe (Wydarzenia, NIE Spektakle)
const TYPES = [
  'Próba stolikowa', 'Próba sytuacyjna', 'Próba techniczna', 'Próba muzyczna',
  'Próba generalna', 'Przymiarki kostiumowe', 'Montaż scenografii', 'Charakteryzacja',
  'Konferencja prasowa', 'Wywiad', 'Zebranie zespołu', 'Warsztaty', 'Sesja zdjęciowa',
]
// Pory dzienne (nie kolidują z wieczornymi spektaklami 19:00)
const SLOTS = [['10:00:00', '13:00:00'], ['14:00:00', '16:30:00']]

const pick = a => a[Math.floor(Math.random() * a.length)]

const { data: prods } = await sb.from('productions').select('id, title, theatre_id').not('theatre_id', 'is', null)
const { data: rooms } = await sb.from('rooms').select('id, theatre_id')
const roomsByTheatre = {}
for (const r of rooms ?? []) (roomsByTheatre[r.theatre_id] ??= []).push(r.id)

const today = new Date('2026-06-14T12:00:00')
const rows = []
for (let d = 0; d < 28; d++) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d)
  const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const n = 1 + Math.floor(Math.random() * 2) // 1 lub 2
  for (let i = 0; i < n; i++) {
    const prod = pick(prods)
    const slot = SLOTS[i % SLOTS.length]
    const type = pick(TYPES)
    const roomList = roomsByTheatre[prod.theatre_id] ?? []
    rows.push({
      title: `${type} — ${prod.title}`,
      type,
      start_time: `${ds}T${slot[0]}`,
      end_time: `${ds}T${slot[1]}`,
      production_id: prod.id,
      theatre_id: prod.theatre_id,
      room_id: roomList.length ? pick(roomList) : null,
      description: TAG,
    })
  }
}

const { data, error } = await sb.from('events').insert(rows).select('id')
if (error) { console.error('Błąd:', error.message); process.exit(1) }
console.log(`✓ Dodano ${data.length} wydarzeń demo (nie-spektaklowych) na 28 dni od 2026-06-14.`)
console.log(`  Czyszczenie: node scripts/seed-demo-events.mjs --clean`)
