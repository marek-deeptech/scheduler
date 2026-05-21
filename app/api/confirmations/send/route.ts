import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function fmtPolish(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const { eventId, artistIds, eventDetails } = await request.json() as {
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
  }

  if (!eventId || !artistIds || artistIds.length === 0) {
    return Response.json({ ok: false, error: 'Missing eventId or artistIds' }, { status: 400 })
  }

  // Upsert confirmations — reset status to 'pending' if already exists
  const upsertPayload = artistIds.map(artist_id => ({
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

  // Fetch artist name + email
  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, email')
    .in('id', artistIds)

  const artistMap: Record<string, { name: string; email: string | null }> = {}
  for (const a of artists ?? []) {
    artistMap[a.id] = { name: a.name, email: a.email }
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

  for (const artistId of artistIds) {
    const artist = artistMap[artistId]
    if (!artist?.email) continue
    const token = tokenMap[artistId]
    if (!token) continue

    const confirmLink  = `${APP_URL}/confirm/${token}?answer=confirmed`
    const declineLink  = `${APP_URL}/confirm/${token}?answer=declined`
    const maybeLink    = `${APP_URL}/confirm/${token}?answer=maybe`
    const pageLink     = `${APP_URL}/confirm/${token}`

    const bodyHtml = emailWrapper(`
      <h2 style="font-size:18px;font-weight:700;margin:0 0 4px">Prośba o potwierdzenie udziału</h2>
      <p style="color:#6b7280;margin:0 0 20px;font-size:14px">Cześć ${artist.name}, prosimy o potwierdzenie swojej dostępności na poniższe wydarzenie.</p>

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

    const subject = `[Potwierdzenie] ${eventTitle} — ${dateLabel}`
    const ok = await sendEmail(artist.email, subject, bodyHtml)
    if (ok) sent++
  }

  return Response.json({ ok: true, sent })
}
