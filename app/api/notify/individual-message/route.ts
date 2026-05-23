import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'

export async function POST(request: Request) {
  const { artistId, subject, body } = await request.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: artist } = await supabase
    .from('artists')
    .select('name, email')
    .eq('id', artistId)
    .single()

  if (!artist?.email) {
    return Response.json({ ok: false, error: 'Brak adresu email' })
  }

  const bodyHtml = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')

  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 16px">${subject.replace(/</g,'&lt;')}</h2>
    <p style="font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap">${bodyHtml}</p>
  `)

  const ok = await sendEmail(artist.email, subject, html)

  if (ok) {
    await supabase.from('actor_messages').insert({
      artist_id: artistId,
      type:      'email',
      subject,
      body,
      sent_at:   new Date().toISOString(),
    })
  }

  return Response.json({ ok, sent: ok ? 1 : 0 })
}
