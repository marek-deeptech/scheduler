import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'
import { logMessages, type MessageLogRow } from '@/lib/message-log'

export async function POST(request: Request) {
  const { artistId, subject, body, channel = 'email' } = await request.json() as {
    artistId: string
    subject: string
    body: string
    channel?: 'email' | 'sms' | 'both'
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: artist } = await supabase
    .from('artists')
    .select('name, email, phone')
    .eq('id', artistId)
    .single()

  if (!artist) {
    return Response.json({ ok: false, error: 'Nie znaleziono artysty' })
  }

  const logRows: MessageLogRow[] = []
  let sentEmail = 0
  let sentSms = 0

  if ((channel === 'email' || channel === 'both') && artist.email) {
    const bodyHtml = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')

    const html = emailWrapper(`
      <h2 style="font-size:18px;font-weight:700;margin:0 0 16px">${subject.replace(/</g,'&lt;')}</h2>
      <p style="font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap">${bodyHtml}</p>
    `)

    const ok = await sendEmail(artist.email, subject, html)
    if (ok) {
      sentEmail++
      logRows.push({ artist_id: artistId, type: 'email', subject, body })
    }
  }

  if ((channel === 'sms' || channel === 'both') && artist.phone) {
    const ok = await sendSms(artist.phone, body)
    if (ok) {
      sentSms++
      logRows.push({ artist_id: artistId, type: 'sms', subject: subject || 'SMS', body })
    }
  }

  await logMessages(supabase, logRows)

  const sent = sentEmail + sentSms
  if (sent === 0) {
    return Response.json({ ok: false, error: channel === 'sms' ? 'Brak numeru telefonu lub błąd wysyłki' : 'Brak adresu email lub błąd wysyłki' })
  }

  return Response.json({ ok: true, sent, sentEmail, sentSms })
}
