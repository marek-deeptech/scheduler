import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { getBaseUrl } from '@/lib/base-url'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


function fmtPolish(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export async function POST(request: Request) {
  const APP_URL = getBaseUrl(request)
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })
  const { eventId, artistIds, eventDetails, channel = 'email' } = await request.json() as {
    eventId: string
    artistIds: string[]
    eventDetails: {
      title: string
      type: string | null
      start_time: string
      end_time: string
      production_title: string | null
      room: string | null
    }
    channel?: 'email' | 'sms' | 'both'
  }

  if (!eventId || !artistIds || artistIds.length === 0) {
    return Response.json({ ok: false, error: 'Missing eventId or artistIds' }, { status: 400 })
  }

  // Fetch notification templates from app_settings
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('org_id', orgId)
    .in('key', ['notification_email_subject', 'notification_email_intro', 'notification_sms'])
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) {
    settings[row.key] = row.value ?? ''
  }

  // Upsert confirmations — reset status to 'pending' if already exists
  const upsertPayload = artistIds.map(artist_id => ({
    org_id: orgId,
    event_id: eventId,
    artist_id,
    status: 'pending',
    sent_at: new Date().toISOString(),
  }))

  const { data: confirmations, error: upsertError } = await supabase
    .from('event_confirmations')
    .upsert(upsertPayload, { onConflict: 'event_id,artist_id' })
    .select('artist_id, token')

  if (upsertError) {
    console.error('Upsert error:', upsertError)
    return Response.json({ ok: false, error: upsertError.message }, { status: 500 })
  }

  // Fetch artist name, email, and phone
  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, email, phone')
    .eq('org_id', orgId)
    .in('id', artistIds)

  const artistMap: Record<string, { name: string; email: string | null; phone: string | null }> = {}
  for (const a of artists ?? []) {
    artistMap[a.id] = { name: a.name, email: a.email, phone: a.phone }
  }

  const tokenMap: Record<string, string> = {}
  for (const c of confirmations ?? []) {
    tokenMap[c.artist_id] = c.token
  }

  const dateLabel = fmtPolish(eventDetails.start_time)
  const startTime = fmtTime(eventDetails.start_time)
  const endTime   = fmtTime(eventDetails.end_time)
  const eventTitle = eventDetails.title || eventDetails.type || 'Wydarzenie'

  const rowStyle   = 'padding:8px 0;font-size:13px'
  const labelStyle = `${rowStyle};color:#6b7280;width:120px`
  const valueStyle = `${rowStyle};font-weight:600`
  const borderRow  = 'border-top:1px solid #f3f4f6'

  const tableRows = [
    `<tr><td style="${labelStyle}">Wydarzenie</td><td style="${valueStyle}">${eventTitle}</td></tr>`,
    `<tr style="${borderRow}"><td style="${labelStyle}">Termin</td><td style="${valueStyle}">${dateLabel}, ${startTime}–${endTime}</td></tr>`,
    eventDetails.production_title
      ? `<tr style="${borderRow}"><td style="${labelStyle}">Produkcja</td><td style="${valueStyle}">${eventDetails.production_title}</td></tr>`
      : '',
    eventDetails.room
      ? `<tr style="${borderRow}"><td style="${labelStyle}">Sala</td><td style="${valueStyle}">${eventDetails.room}</td></tr>`
      : '',
  ].join('')

  const btnBase = 'display:inline-block;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;margin:8px 6px 8px 0;min-width:80px;text-align:center'

  let sent = 0
  let sentEmail = 0
  let sentSms = 0

  const notifiedArtistIds = new Set<string>()
  const logRows: MessageLogRow[] = []
  const logSummary = `Prośba o potwierdzenie: ${eventTitle}, ${dateLabel}, ${startTime}–${endTime}${eventDetails.production_title ? ` (${eventDetails.production_title})` : ''}`

  for (const artistId of artistIds) {
    const artist = artistMap[artistId]
    if (!artist) continue
    const token = tokenMap[artistId]
    if (!token) continue

    const confirmLink  = `${APP_URL}/confirm/${token}?answer=confirmed`
    const declineLink  = `${APP_URL}/confirm/${token}?answer=declined`
    const maybeLink    = `${APP_URL}/confirm/${token}?answer=maybe`
    const pageLink     = `${APP_URL}/confirm/${token}`

    let artistNotified = false

    const templateVars = {
      name: artist.name,
      eventTitle,
      date: dateLabel,
      startTime,
      endTime,
      confirmLink,
      declineLink,
      maybeLink,
      pageLink,
    }

    // Email
    if ((channel === 'email' || channel === 'both') && artist.email) {
      const intro = fillTemplate(
        settings['notification_email_intro'] ?? 'Cześć {name}, prosimy o potwierdzenie swojej dostępności na poniższe wydarzenie.',
        templateVars,
      )

      const bodyHtml = emailWrapper(`
        <h2 style="font-size:18px;font-weight:700;margin:0 0 4px">Prośba o potwierdzenie udziału</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px">${intro}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          ${tableRows}
        </table>

        <p style="font-size:13px;font-weight:600;margin:0 0 12px;color:#374151">Czy możesz wziąć udział?</p>

        <div style="margin-bottom:24px">
          <a href="${confirmLink}" style="${btnBase};background:#16a34a;color:#ffffff">✓ TAK</a>
          <a href="${declineLink}" style="${btnBase};background:#dc2626;color:#ffffff">✗ NIE</a>
          <a href="${maybeLink}"   style="${btnBase};background:#d97706;color:#ffffff">~ MOŻE</a>
        </div>

        <p style="font-size:12px;color:#9ca3af;margin:0">
          Możesz też otworzyć stronę potwierdzenia, aby dodać komentarz:<br/>
          <a href="${pageLink}" style="color:#4b5563">${pageLink}</a>
        </p>
      `)

      const subject = fillTemplate(
        settings['notification_email_subject'] ?? '[Potwierdzenie] {eventTitle} — {date}',
        templateVars,
      )
      const ok = await sendEmail(artist.email, subject, bodyHtml)
      if (ok) {
        sentEmail++
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'email',
          kind: 'confirmation_request',
          subject,
          body: logSummary,
          related_event_id: eventId,
        })
      }
    }

    // SMS
    if ((channel === 'sms' || channel === 'both') && artist.phone) {
      const smsText = fillTemplate(
        settings['notification_sms'] ?? 'Cześć {name}! Potwierdź udział w: {eventTitle}, {date}, godz. {startTime}. Kliknij: {pageLink}',
        templateVars,
      )
      const ok = await sendSms(artist.phone, smsText)
      if (ok) {
        sentSms++
        artistNotified = true
        logRows.push({
          artist_id: artistId,
          type: 'sms',
          kind: 'confirmation_request',
          subject: `Potwierdzenie: ${eventTitle}`,
          body: logSummary,
          related_event_id: eventId,
        })
      }
    }

    if (artistNotified) {
      notifiedArtistIds.add(artistId)
    }
  }

  sent = notifiedArtistIds.size

  await logMessages(supabase, logRows, orgId)

  return Response.json({ ok: true, sent, sentEmail, sentSms })
}
