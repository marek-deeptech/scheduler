import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'
import { bumpInviteSeqs, inviteAttachment } from '@/lib/calendar-invite'
import { localFromStored, type Vevent } from '@/lib/ics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

const MONTH_NAMES = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const MONTH_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

// Miejscownik: „grasz w 1 spektaklu" / „grasz w N spektaklach"
function pluralSpektakl(n: number): string {
  return n === 1 ? 'spektaklu' : 'spektaklach'
}

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month ?? '')
  if (!m) return month ?? ''
  return `${MONTH_NOM[parseInt(m[2], 10) - 1]} ${m[1]}`
}

function fmtDay(iso: string) {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('pl-PL', { weekday: 'short' })
  return `${weekday} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface InsertedEvent {
  id: string
  production_id: string | null
  title: string
  type: string | null
  start_time: string
  end_time: string
}

/** Po zatwierdzeniu: każdy aktor z obsady dostaje zestawienie swoich dat
 *  + prośby o potwierdzenie (event_confirmations) w jednym mailu. */
async function notifyCastAfterApproval(insertedEvents: InsertedEvent[], month: string) {
  const productionIds = [...new Set(insertedEvents.map(e => e.production_id).filter(Boolean))] as string[]
  if (productionIds.length === 0) return { notified: 0 }

  const { data: castRows } = await supabase
    .from('artist_productions')
    .select('artist_id, production_id, artists(id, name, email, phone)')
    .in('production_id', productionIds)

  // artist -> jego wydarzenia
  const artistEvents: Record<string, InsertedEvent[]> = {}
  const artistInfo: Record<string, { name: string; email: string | null; phone: string | null }> = {}
  for (const row of (castRows ?? []) as any[]) {
    const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
    if (!artist) continue
    artistInfo[row.artist_id] = { name: artist.name, email: artist.email, phone: artist.phone }
    const evs = insertedEvents.filter(e => e.production_id === row.production_id)
    if (evs.length === 0) continue
    ;(artistEvents[row.artist_id] ??= []).push(...evs)
  }

  // Prośby o potwierdzenie dla wszystkich par (wydarzenie, aktor)
  const confirmationPayload: { event_id: string; artist_id: string; status: string; sent_at: string }[] = []
  const sentAt = new Date().toISOString()
  for (const [artistId, evs] of Object.entries(artistEvents)) {
    for (const ev of evs) {
      confirmationPayload.push({ event_id: ev.id, artist_id: artistId, status: 'pending', sent_at: sentAt })
    }
  }

  const tokenMap: Record<string, string> = {} // `${event_id}:${artist_id}` -> token
  if (confirmationPayload.length > 0) {
    const { data: confs } = await supabase
      .from('event_confirmations')
      .upsert(confirmationPayload, { onConflict: 'event_id,artist_id' })
      .select('event_id, artist_id, token')
    for (const c of (confs ?? []) as any[]) {
      tokenMap[`${c.event_id}:${c.artist_id}`] = c.token
    }
  }

  const label = monthLabel(month)
  const logRows: MessageLogRow[] = []
  let notified = 0

  // ⚠️ TEST: wyślij powiadomienia tylko do pierwszych N aktorów (0 = bez limitu).
  // Ustaw 0 (lub usuń ten blok) przed realnym wdrożeniem.
  const TEST_MAX_NOTIFY = 5
  const notifyEntries = TEST_MAX_NOTIFY > 0
    ? Object.entries(artistEvents).slice(0, TEST_MAX_NOTIFY)
    : Object.entries(artistEvents)

  // Zaproszenia kalendarzowe (.ics) — SEQUENCE per (event, aktor), doklejane do maili.
  const invitePairs = notifyEntries.flatMap(([aid, evs]) =>
    evs.map(e => ({ event_id: e.id, artist_id: aid })))
  const seqMap = await bumpInviteSeqs(supabase, invitePairs)

  for (const [artistId, evsRaw] of notifyEntries) {
    const info = artistInfo[artistId]
    if (!info) continue
    const evs = [...evsRaw].sort((a, b) => a.start_time.localeCompare(b.start_time))

    const listText = evs
      .map(e => `${fmtDay(e.start_time)}, ${fmtTime(e.start_time)} — ${e.title}`)
      .join('\n')

    let artistNotified = false

    if (info.email) {
      const rows = evs.map(e => {
        const token = tokenMap[`${e.id}:${artistId}`]
        const link = token
          ? `<a href="${APP_URL}/confirm/${token}" style="display:inline-block;padding:6px 14px;border-radius:8px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;text-decoration:none">Potwierdź</a>`
          : ''
        return `<tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;font-size:13px;font-weight:600">${fmtDay(e.start_time)}</td>
          <td style="padding:10px 8px;font-size:13px">${fmtTime(e.start_time)}–${fmtTime(e.end_time)}</td>
          <td style="padding:10px 8px;font-size:13px">${e.title}</td>
          <td style="padding:10px 0;text-align:right">${link}</td>
        </tr>`
      }).join('')

      const html = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Repertuar ${label} zatwierdzony</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px">
          Cześć ${info.name}, repertuar na ${label} został zatwierdzony.
          Grasz w ${evs.length} ${evs.length === 1 ? 'spektaklu' : 'spektaklach'} — prosimy o potwierdzenie każdego terminu.
        </p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      `)

      const vevents: Vevent[] = evs.map(e => {
        const seq = seqMap.get(`${e.id}:${artistId}`)
        return {
          uid: seq?.uid ?? `${e.id}.${artistId}@repertuar.vercel.app`,
          sequence: seq?.sequence ?? 0,
          startLocal: localFromStored(e.start_time),
          endLocal: localFromStored(e.end_time),
          summary: e.title,
          description: `Spektakl — repertuar ${label}. Potwierdź udział w aplikacji.`,
        }
      })
      const ok = await sendEmail(
        info.email,
        `[Repertuar] ${label} — Twoje spektakle (${evs.length})`,
        html,
        { attachments: [inviteAttachment('REQUEST', { name: info.name, email: info.email }, vevents)] },
      )
      if (ok) {
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'email',
          kind: 'repertoire_approved',
          subject: `Repertuar ${label} zatwierdzony — ${evs.length} spektakli`,
          body: listText,
        })
      }
    }

    if (info.phone) {
      const sms = `Repertuar ${label} zatwierdzony. Grasz w ${evs.length} ${pluralSpektakl(evs.length)} — szczegóły i potwierdzenia w mailu lub aplikacji.`
      const ok = await sendSms(info.phone, sms)
      if (ok) {
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'sms',
          kind: 'repertoire_approved',
          subject: `Repertuar ${label} zatwierdzony`,
          body: sms,
        })
      }
    }

    if (artistNotified) notified++
  }

  await logMessages(supabase, logRows)
  return { notified }
}

export async function POST(request: Request) {
  const { proposalId, action } = await request.json() as {
    proposalId: string
    action: 'approve' | 'reject'
  }

  if (!proposalId) return Response.json({ error: 'Missing proposalId' }, { status: 400 })

  // ── Reject ───────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { error } = await supabase
      .from('repertoire_proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  const { data: proposal, error: fetchErr } = await supabase
    .from('repertoire_proposals')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (fetchErr || !proposal) {
    return Response.json({ error: 'Proposal not found' }, { status: 404 })
  }

  // Insert events into calendar
  const events = ((proposal.proposal_data ?? []) as any[]).map(e => ({
    title: e.production_title,
    type: e.type ?? 'spektakl',
    start_time: `${e.date}T${e.start_time ?? '19:00:00'}`,
    end_time:   `${e.date}T${e.end_time   ?? '21:30:00'}`,
    production_id: e.production_id ?? null,
    room_id:       e.room_id       ?? null,
  }))

  let insertedEvents: InsertedEvent[] = []
  if (events.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from('events')
      .insert(events)
      .select('id, production_id, title, type, start_time, end_time')
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
    insertedEvents = (inserted ?? []) as InsertedEvent[]
  }

  // Mark this proposal approved
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', proposalId)

  // Reject other drafts for same month
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'rejected' })
    .eq('month', proposal.month)
    .neq('id', proposalId)
    .eq('status', 'draft')

  // Notify cast — błąd powiadomień nie blokuje zatwierdzenia
  let notified = 0
  try {
    const result = await notifyCastAfterApproval(insertedEvents, proposal.month)
    notified = result.notified
  } catch (err) {
    console.error('Cast notification error:', err)
  }

  return Response.json({ ok: true, eventsCreated: events.length, actorsNotified: notified })
}
