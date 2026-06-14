// Seeduje dane do tablicy statusów Wiadomości + kafelka "Nie potwierdzili na jutro".
// Czyszczenie: node scripts/seed-demo-comm.mjs --clean
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const DEMO_MONTH = '2099-01', DEMO_COMMENT = 'demo-comm', DEMO_SUBJ = 'DEMO:'

if (process.argv.includes('--clean')) {
  const { data: slots } = await sb.from('repertoire_slots').select('id').eq('month', DEMO_MONTH)
  for (const s of slots ?? []) { await sb.from('slot_invites').delete().eq('slot_id', s.id); await sb.from('repertoire_slots').delete().eq('id', s.id) }
  const { data: c } = await sb.from('event_confirmations').delete().eq('comment', DEMO_COMMENT).select('id')
  const { data: m } = await sb.from('actor_messages').delete().like('subject', `${DEMO_SUBJ}%`).select('id')
  console.log(`Wyczyszczono: ${slots?.length ?? 0} slotów, ${c?.length ?? 0} potwierdzeń, ${m?.length ?? 0} wiadomości demo.`)
  process.exit(0)
}

const pick = a => a[Math.floor(Math.random() * a.length)]
const tomorrow = '2026-06-15'

// 1. Pending potwierdzenia na jutrzejsze spektakle (+ kilka oznaczonych jako "po zmianie")
const { data: tomEvents } = await sb.from('events')
  .select('id, production_id, type, event_artists(artist_id)')
  .gte('start_time', `${tomorrow}T00:00:00`).lte('start_time', `${tomorrow}T23:59:59`)
  .in('type', ['Spektakl', 'Premiera', 'Spektakl gościnny'])
let confRows = [], changeMsgs = [], made = 0
for (const ev of (tomEvents ?? []).slice(0, 6)) {
  const cast = (ev.event_artists ?? []).map(e => e.artist_id)
  const { data: ap } = cast.length ? { data: cast.map(id => ({ artist_id: id })) } : await sb.from('artist_productions').select('artist_id').eq('production_id', ev.production_id)
  const ids = (ap ?? []).map(a => a.artist_id).slice(0, 2)
  for (const aid of ids) {
    confRows.push({ event_id: ev.id, artist_id: aid, status: 'pending', token: randomUUID(), sent_at: new Date().toISOString(), comment: DEMO_COMMENT })
    if (made < 2) { changeMsgs.push({ artist_id: aid, type: 'email', kind: 'event_change', subject: `${DEMO_SUBJ} Zmiana godziny`, body: 'Zmiana', related_event_id: ev.id, sent_at: new Date().toISOString() }); made++ }
  }
}
if (confRows.length) await sb.from('event_confirmations').upsert(confRows, { onConflict: 'event_id,artist_id' })
if (changeMsgs.length) await sb.from('actor_messages').insert(changeMsgs)

// 2. Niezbita ankieta dostępności — slot demo + zaproszenia bez odpowiedzi
const { data: favs } = await sb.from('productions').select('id, title, artist_productions(artist_id)').eq('is_favourite', true).limit(1)
const fav = favs?.[0]
if (fav) {
  const { data: slot } = await sb.from('repertoire_slots').insert({ month: DEMO_MONTH, production_id: fav.id, window_start: '2099-01-05', window_end: '2099-01-12', target_performances: 4, status: 'collecting' }).select('id').single()
  const ids = (fav.artist_productions ?? []).map(a => a.artist_id).slice(0, 4)
  if (ids.length) await sb.from('slot_invites').insert(ids.map(aid => ({ slot_id: slot.id, artist_id: aid, token: randomUUID() })))
}

// 3. Zastępstwa
const { data: someArtists } = await sb.from('artists').select('id, name').limit(2)
if (someArtists?.length) await sb.from('actor_messages').insert(someArtists.map(a => ({
  artist_id: a.id, type: 'email', kind: 'substitution', subject: `${DEMO_SUBJ} Zastępstwo: ${fav?.title ?? 'Spektakl'}`, body: 'Wyznaczono zastępstwo', sent_at: new Date().toISOString(),
})))

console.log(`✓ Demo komunikacji: ${confRows.length} pending potwierdzeń (${made} po zmianie), slot z ankietą, 2 zastępstwa.`)
