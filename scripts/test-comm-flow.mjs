// End-to-end test przepływu komunikacji koordynator–aktorzy.
// Stawia izolowany fixture, odpala każdy endpoint, weryfikuje efekty w bazie,
// na końcu sprząta. Wysyłka kierowana wyłącznie na kontakt testowy.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const API = 'http://localhost:3000'

const TEST_EMAIL = 'marek@veryniceworks.com'
const TEST_PHONE = '+48608499442'
const THEATRE = '96187687-13eb-4b49-ab60-cc587f58119e' // Teatr Polonia
const ROOM    = 'b3ac9fa0-be50-4514-b59c-cfdd859f01ad' // Duża Scena
const CAST    = '8c426841-7c11-4e3b-a181-62e036d0e6db'
const DATE    = '2026-07-04'

const log = (...a) => console.log(...a)
const ok  = (c, m) => log(`  ${c ? '✅' : '❌'} ${m}`)
async function post(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, j }
}

const created = { artists: [], productions: [], events: [], proposals: [] }

async function setup() {
  log('\n━━━ SETUP ━━━')
  const { data: prod } = await sb.from('productions').insert({
    title: 'ZZZ TEST Komunikacja', theatre_id: THEATRE, status: 'Bieżące',
  }).select('id, title').single()
  created.productions.push(prod.id)
  log(`  Produkcja: ${prod.title} (${prod.id})`)

  const { data: actors, error: aErr } = await sb.from('artists').insert([
    { name: 'ZZZ TEST Aktor Główny', email: 'marek+aktor@veryniceworks.com',    phone: TEST_PHONE, team_id: CAST, status: 'Dostępny', role: 'Aktor' },
    { name: 'ZZZ TEST Zastępca',     email: 'marek+zastepca@veryniceworks.com', phone: TEST_PHONE, team_id: CAST, status: 'Dostępny', role: 'Aktor' },
  ]).select('id, name')
  if (aErr) throw new Error('insert artists: ' + aErr.message)
  const main = actors[0], sub = actors[1]
  created.artists.push(main.id, sub.id)
  log(`  Aktor główny: ${main.id}\n  Zastępca:     ${sub.id}`)

  await sb.from('artist_productions').insert([
    { artist_id: main.id, production_id: prod.id },
    { artist_id: sub.id,  production_id: prod.id },
  ])
  await sb.from('actor_substitutes').insert({ actor_id: main.id, substitute_id: sub.id })

  const { data: prop } = await sb.from('repertoire_proposals').insert({
    month: '2026-07', label: 'ZZZ TEST Lipiec', status: 'draft',
    proposal_data: [{
      date: DATE, type: 'spektakl', start_time: '19:00:00', end_time: '21:30:00',
      production_id: prod.id, production_title: prod.title, room_id: ROOM, room_name: 'Duża Scena',
    }],
  }).select('id').single()
  created.proposals.push(prop.id)
  log(`  Propozycja repertuaru: ${prop.id} (draft, 1 spektakl ${DATE})`)
  return { prodId: prod.id, prodTitle: prod.title, mainId: main.id, subId: sub.id, propId: prop.id }
}

async function run() {
  const f = await setup()

  // ── A. Zatwierdzenie repertuaru ──────────────────────────────────────────
  log('\n━━━ A. Zatwierdzenie repertuaru → powiadomienia + potwierdzenia ━━━')
  const a = await post('/api/planning/approve', { proposalId: f.propId, action: 'approve' })
  log(`  HTTP ${a.status} · ${JSON.stringify(a.j)}`)
  const { data: evs } = await sb.from('events').select('id, start_time').eq('production_id', f.prodId)
  evs.forEach(e => created.events.push(e.id))
  ok(evs.length === 1, `Wydarzenie utworzone w kalendarzu (${evs.length})`)
  const eventId = evs[0]?.id
  ok(a.j.actorsNotified >= 1, `Aktorzy powiadomieni: ${a.j.actorsNotified}`)
  const { data: confs } = await sb.from('event_confirmations').select('id, artist_id, token, status').eq('event_id', eventId)
  ok(confs.length >= 1, `Prośby o potwierdzenie utworzone: ${confs.length}`)
  const mainConf = confs.find(c => c.artist_id === f.mainId)

  // ── B. Aktor odpowiada ───────────────────────────────────────────────────
  log('\n━━━ B. Aktor potwierdza udział ━━━')
  const b = await post('/api/confirmations/respond', { token: mainConf.token, status: 'confirmed', comment: 'TEST — potwierdzam' })
  log(`  HTTP ${b.status} · ${JSON.stringify(b.j)}`)
  const { data: after } = await sb.from('event_confirmations').select('status, comment').eq('id', mainConf.id).single()
  ok(after.status === 'confirmed', `Status zmieniony na: ${after.status} (komentarz: „${after.comment}")`)

  // ── C. Ręczna prośba o potwierdzenie ─────────────────────────────────────
  log('\n━━━ C. Ręczna prośba o potwierdzenie (email + SMS) ━━━')
  const c = await post('/api/confirmations/send', {
    eventId, artistIds: [f.mainId], channel: 'both',
    eventDetails: { title: f.prodTitle, type: 'spektakl', start_time: `${DATE}T19:00:00`, end_time: `${DATE}T21:30:00`, production_title: f.prodTitle, room: 'Duża Scena' },
  })
  log(`  HTTP ${c.status} · ${JSON.stringify(c.j)}`)
  ok(c.j.sentEmail >= 1, `Email wysłany: ${c.j.sentEmail}`)
  ok(c.j.sentSms >= 1, `SMS wysłany: ${c.j.sentSms}`)

  // ── D. Zgłoszenie choroby → alarm do koordynatora ────────────────────────
  log('\n━━━ D. Aktor zgłasza chorobę → alarm do koordynatora ━━━')
  await sb.from('actor_day_status').delete().eq('artist_id', f.mainId).eq('date', DATE)
  await sb.from('actor_day_status').insert({ artist_id: f.mainId, date: DATE, status: 'Choroba', note: 'TEST — gorączka' })
  const d = await post('/api/notify/availability-change', {
    artistId: f.mainId, days: [{ date: DATE, status: 'Choroba', note: 'TEST — gorączka' }],
  })
  log(`  HTTP ${d.status} · ${JSON.stringify(d.j)}`)
  ok(d.j.affected >= 1, `Wykryto zagrożone spektakle: ${d.j.affected}`)
  ok(d.j.emailSent === true, `Alarm wysłany do koordynatora (${TEST_EMAIL}): ${d.j.emailSent}`)

  // ── E. Zastępstwo ────────────────────────────────────────────────────────
  log('\n━━━ E. Wyznaczenie zastępstwa → powiadomienia ━━━')
  const e = await post('/api/notify/substitution', {
    removedArtistId: f.mainId, substituteId: f.subId, eventIds: [eventId], productionTitle: f.prodTitle,
  })
  log(`  HTTP ${e.status} · ${JSON.stringify(e.j)}`)
  ok(e.j.sent >= 2, `Powiadomienia wysłane (zastępca + odwołany): ${e.j.sent}`)
  const { data: subConf } = await sb.from('event_confirmations').select('status').eq('event_id', eventId).eq('artist_id', f.subId)
  ok(subConf.length === 1, `Prośba o potwierdzenie dla zastępcy utworzona (status: ${subConf[0]?.status})`)

  // ── F. Wiadomość indywidualna (email + SMS) ──────────────────────────────
  log('\n━━━ F. Wiadomość indywidualna od koordynatora (email + SMS) ━━━')
  const ff = await post('/api/notify/individual-message', {
    artistId: f.mainId, subject: 'ZZZ TEST — wiadomość', body: 'To jest testowa wiadomość end-to-end.', channel: 'both',
  })
  log(`  HTTP ${ff.status} · ${JSON.stringify(ff.j)}`)
  ok(ff.j.sentEmail >= 1 && ff.j.sentSms >= 1, `Email: ${ff.j.sentEmail}, SMS: ${ff.j.sentSms}`)

  // ── Log w actor_messages + kategoryzacja (po migracji) ───────────────────
  log('\n━━━ Ślad w actor_messages (zakładka Wiadomości) ━━━')
  const { data: msgs } = await sb.from('actor_messages')
    .select('type, subject, direction, kind, read_at')
    .in('artist_id', [f.mainId, f.subId]).order('sent_at', { ascending: false })
  ok((msgs?.length ?? 0) >= 3, `Wpisów w logu dla testowych aktorów: ${msgs?.length ?? 0}`)
  ;(msgs ?? []).slice(0, 10).forEach(m => log(`     · [${m.type}/${m.direction}/${m.kind}] ${m.subject}`))

  const kinds = new Set((msgs ?? []).map(m => m.kind))
  ok(kinds.has('repertoire_approved'), `kind=repertoire_approved zapisany`)
  ok(kinds.has('confirmation_request'), `kind=confirmation_request zapisany`)
  ok(kinds.has('substitution'), `kind=substitution zapisany`)

  // Alarm do koordynatora — direction=to_coordinator (po migracji, artist_id główny)
  const { data: alarm } = await sb.from('actor_messages')
    .select('direction, kind, subject')
    .eq('artist_id', f.mainId).eq('kind', 'availability_change').limit(1)
  ok(alarm?.[0]?.direction === 'to_coordinator', `Alarm choroby: direction=${alarm?.[0]?.direction ?? 'BRAK'} (oczekiwane to_coordinator)`)
}

async function cleanup() {
  log('\n━━━ CLEANUP ━━━')
  if (created.events.length) {
    await sb.from('event_confirmations').delete().in('event_id', created.events)
    await sb.from('event_artists').delete().in('event_id', created.events)
    await sb.from('events').delete().in('id', created.events)
  }
  if (created.artists.length) {
    await sb.from('actor_day_status').delete().in('artist_id', created.artists)
    await sb.from('actor_substitutes').delete().in('actor_id', created.artists)
    await sb.from('actor_substitutes').delete().in('substitute_id', created.artists)
    await sb.from('artist_productions').delete().in('artist_id', created.artists)
    await sb.from('actor_messages').delete().in('artist_id', created.artists)
  }
  if (created.proposals.length) await sb.from('repertoire_proposals').delete().in('id', created.proposals)
  if (created.productions.length) await sb.from('productions').delete().in('id', created.productions)
  if (created.artists.length) await sb.from('artists').delete().in('id', created.artists)
  log('  Fixture usunięty.')
}

try {
  await run()
} catch (err) {
  log('\n❌ BŁĄD:', err?.message ?? err)
} finally {
  await cleanup()
  log('\n✓ Test zakończony.')
}
