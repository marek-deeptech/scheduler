import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailWrapper } from '@/lib/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const { productionId, productionTitle, subject, body } = await request.json() as {
    productionId: string
    productionTitle: string
    subject: string
    body: string
  }

  const { data } = await supabase
    .from('artist_productions')
    .select('artists(name, email)')
    .eq('production_id', productionId)

  const emails: string[] = []
  for (const row of (data ?? []) as any[]) {
    const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
    if (artist?.email) emails.push(artist.email)
  }

  if (emails.length === 0) {
    return Response.json({ ok: true, sent: 0 })
  }

  const bodyParagraphs = body
    .split('\n')
    .map((line: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${line}</p>`)
    .join('')

  const html = emailWrapper(`
    ${bodyParagraphs}
    <p style="margin-top:20px;font-size:12px;color:#9ca3af">Wiadomość dotyczy produkcji: ${productionTitle}</p>
  `)

  let sent = 0
  for (const email of emails) {
    const ok = await sendEmail(email, subject, html)
    if (ok) sent++
  }

  return Response.json({ ok: true, sent })
}
