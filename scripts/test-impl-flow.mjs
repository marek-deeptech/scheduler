// E2E Etap 5-6: zatwierdzony repertuar -> potwierdzenia -> 100% -> auto-raport.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const API = 'http://localhost:3000'
const MONTH = '2027-03'
const log = (...a) => console.log(...a)
const ok = (c, m) => log(`  ${c ? '✅' : '❌'} ${m}`)
const made = { proposal: null, event: null, conf: null }

async function run() {
  const { data: prod } = await sb.from('productions').select('id, title').limit(1).single()
  const { data: artist } = await sb.from('artists').select('id, name, email').eq('name', 'Marek Mielnicki').single()
  const { data: room } = await sb.from('rooms').select('id').limit(1).single()

  // 1. Zatwierdzona propozycja z estymacją finansową
  const { data: prop } = await sb.from('repertoire_proposals').insert({
    month: MONTH, label: 'Zbalansowana', status: 'approved', approved_at: new Date().toISOString(),
    proposal_data: [], reasoning: 'TEST',
    stats: { total: 1, conflicts: 0, by_production: { [prod.title]: 1 }, objective: 'balanced',
      finance: { revenue: 21280, cost: 8000, margin: 13280, attendance: 0.75, locked: 0 } },
  }).select('id').single()
  made.proposal = prop.id
  log(`\n━━━ SETUP ━━━\n  Zatwierdzona propozycja ${MONTH}: ${prop.id}`)

  // 2. Wydarzenie w marcu 2027
  const { data: ev } = await sb.from('events').insert({
    title: prod.title, type: 'spektakl', production_id: prod.id, room_id: room.id,
    start_time: `${MONTH}-07T19:00:00`, end_time: `${MONTH}-07T21:30:00`,
  }).select('id').single()
  made.event = ev.id
  log(`  Wydarzenie: ${ev.id}`)

  // 3. Potwierdzenie (pending) z tokenem
  const token = randomUUID()
  const { data: conf } = await sb.from('event_confirmations').insert({
    event_id: ev.id, artist_id: artist.id, status: 'pending', token, sent_at: new Date().toISOString(),
  }).select('id').single()
  made.conf = conf.id
  log(`  Potwierdzenie (pending) dla ${artist.name}`)

  // 4. Status wdrożenia przed potwierdzeniem
  const s1 = await (await fetch(`${API}/api/planning/implementation-status?month=${MONTH}`)).json()
  log(`\n━━━ STATUS PRZED ━━━`)
  ok(!!s1.approved, `Zatwierdzony wariant: ${s1.approved?.label}`)
  ok(s1.confirmations.confirmed === 0 && s1.confirmations.pending === 1, `Potwierdzenia: ${s1.confirmations.confirmed}/${s1.confirmations.total} (oczekuje ${s1.confirmations.pending})`)
  ok(!s1.reportSentAt, 'Raport jeszcze nie wysłany')

  // 5. Aktor potwierdza -> powinno dopełnić 100% i odpalić auto-raport
  log(`\n━━━ AKTOR POTWIERDZA ━━━`)
  const resp = await (await fetch(`${API}/api/confirmations/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, status: 'confirmed' }),
  })).json()
  ok(resp.ok && resp.status === 'confirmed', `Odpowiedź zapisana: ${resp.status}`)

  // 6. Status po — raport powinien być wysłany automatycznie
  await new Promise(r => setTimeout(r, 1500))
  const s2 = await (await fetch(`${API}/api/planning/implementation-status?month=${MONTH}`)).json()
  log(`\n━━━ STATUS PO ━━━`)
  ok(s2.confirmations.allConfirmed, `100% potwierdzeń: ${s2.confirmations.confirmed}/${s2.confirmations.total}`)
  ok(!!s2.reportSentAt, `Auto-raport wysłany: ${s2.reportSentAt ?? 'NIE'} (na adres Dyr. Finansowego)`)
}

async function cleanup() {
  log(`\n━━━ CLEANUP ━━━`)
  if (made.conf) await sb.from('event_confirmations').delete().eq('id', made.conf)
  if (made.event) await sb.from('events').delete().eq('id', made.event)
  if (made.proposal) await sb.from('repertoire_proposals').delete().eq('id', made.proposal)
  // usuń ewentualny log raportu
  await sb.from('actor_messages').delete().is('artist_id', null).ilike('subject', '%Marzec 2027%')
  log('  Fixture usunięty.')
}

try { await run() } catch (e) { log('\n❌ BŁĄD:', e?.message ?? e) } finally { await cleanup(); log('\n✓ Test zakończony.') }
