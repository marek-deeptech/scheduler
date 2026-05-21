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
    .select('name, email')
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
  for (const artist of withEmail) {
    const ok = await sendEmail((artist as any).email, subject, html)
    if (ok) sent++
  }

  return Response.json({ ok: true, sent, total: withEmail.length })
}
