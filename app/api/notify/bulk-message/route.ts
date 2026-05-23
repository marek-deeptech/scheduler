import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'

export async function POST(request: Request) {
  const { artistIds, subject, body } = await request.json() as { artistIds: string[], subject: string, body: string }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, email')
    .in('id', artistIds)

  const withEmail = (artists ?? []).filter((a: any) => a.email)

  const bodyHtml = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')

  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 16px">${subject.replace(/</g,'&lt;')}</h2>
    <p style="font-size:14px;line-height:1.7;color:#374151">${bodyHtml}</p>
  `)

  let sent = 0
  const logRows: { artist_id: string; type: string; subject: string; body: string; sent_at: string }[] = []
  const sentAt = new Date().toISOString()

  for (const artist of withEmail) {
    const a = artist as any
    const ok = await sendEmail(a.email, subject, html)
    if (ok) {
      sent++
      logRows.push({ artist_id: a.id, type: 'email', subject, body, sent_at: sentAt })
    }
  }

  if (logRows.length > 0) {
    await supabase.from('actor_messages').insert(logRows)
  }

  return Response.json({ ok: true, sent, total: withEmail.length })
}
