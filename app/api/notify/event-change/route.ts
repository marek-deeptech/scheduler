import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
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
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export async function POST(request: Request) {
  const { action, event, artistIds } = await request.json() as {
    action: 'save' | 'delete'
    event: { id: string; title: string; type: string | null; start_time: string; end_time: string; production_title: string | null; location: string | null }
    artistIds: string[]
  }

  if (!artistIds || artistIds.length === 0) {
    return Response.json({ ok: true, sent: 0 })
  }

  // Zmiana zatwierdzonego wydarzenia → reset potwierdzeń udziału do „brak potwierdzenia".
  // Aktor musi potwierdzić ponownie po zmianie.
  if (action === 'save' && event?.id) {
    await supabase
      .from('event_confirmations')
      .update({ status: 'pending', responded_at: null })
      .eq('event_id', event.id)
      .in('artist_id', artistIds)
  }

  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, email')
    .in('id', artistIds)

  const recipients = (artists ?? []).filter((a: any) => a.email) as { id: string; name: string; email: string }[]

  if (recipients.length === 0) {
    return Response.json({ ok: true, sent: 0 })
  }

  const dateLabel = fmtPolish(event.start_time)
  const startTime = fmtTime(event.start_time)
  const endTime   = fmtTime(event.end_time)

  const rowStyle = 'padding:8px 0;font-size:13px'
  const labelStyle = `${rowStyle};color:#6b7280;width:120px`
  const valueStyle = `${rowStyle};font-weight:600`
  const borderRow  = 'border-top:1px solid #f3f4f6'

  const tableRows = [
    `<tr><td style="${labelStyle}">Wydarzenie</td><td style="${valueStyle}">${event.title}</td></tr>`,
    `<tr style="${borderRow}"><td style="${labelStyle}">Termin</td><td style="${valueStyle}">${dateLabel}, ${startTime}–${endTime}</td></tr>`,
    event.production_title
      ? `<tr style="${borderRow}"><td style="${labelStyle}">Produkcja</td><td style="${valueStyle}">${event.production_title}</td></tr>`
      : '',
    event.location
      ? `<tr style="${borderRow}"><td style="${labelStyle}">Miejsce</td><td style="${valueStyle}">${event.location}</td></tr>`
      : '',
  ].join('')

  let subject: string
  let bodyHtml: string

  if (action === 'save') {
    subject = `[Grafik] ${event.title} — ${dateLabel}`
    bodyHtml = emailWrapper(`
      <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Zmiana w grafiku</h2>
      <p style="color:#6b7280;margin:0 0 20px">Informacja o aktualizacji terminu próby lub wydarzenia.</p>
      <table style="width:100%;border-collapse:collapse">
        ${tableRows}
      </table>
    `)
  } else {
    subject = `[Odwołane] ${event.title} — ${dateLabel}`
    bodyHtml = emailWrapper(`
      <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#dc2626">Wydarzenie odwołane</h2>
      <p style="color:#6b7280;margin:0 0 20px">Poniższe wydarzenie zostało usunięte z grafiku.</p>
      <table style="width:100%;border-collapse:collapse;opacity:0.7">
        ${tableRows}
      </table>
      <p style="margin-top:20px;font-size:13px;color:#6b7280">W razie pytań skontaktuj się z koordynatorem.</p>
    `)
  }

  const summary = action === 'save'
    ? `Zmiana w grafiku: ${event.title}, ${dateLabel}, ${startTime}–${endTime}${event.production_title ? ` (${event.production_title})` : ''}`
    : `Odwołano: ${event.title}, ${dateLabel}, ${startTime}–${endTime}${event.production_title ? ` (${event.production_title})` : ''}`

  let sent = 0
  const logRows: MessageLogRow[] = []
  for (const artist of recipients) {
    const ok = await sendEmail(artist.email, subject, bodyHtml)
    if (ok) {
      sent++
      logRows.push({
        artist_id: artist.id,
        type: 'email',
        kind: 'event_change',
        subject,
        body: summary,
        related_event_id: action === 'save' ? event.id : null,
      })
    }
  }

  await logMessages(supabase, logRows)

  return Response.json({ ok: true, sent })
}
