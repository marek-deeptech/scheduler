import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Koordynacja Teatru <onboarding@resend.dev>'

export async function sendEmail(to: string | string[], subject: string, html: string) {
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) console.error('Resend error:', error)
  return !error
}

export function emailWrapper(content: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;padding:20px">
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:24px">Teatr — System Planowania</p>
  ${content}
  <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0"/>
  <p style="font-size:11px;color:#9ca3af">Koordynacja Teatru · Wiadomość automatyczna</p>
</div>`
}
