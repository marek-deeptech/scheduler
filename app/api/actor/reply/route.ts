import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sendEmail, emailWrapper } from '@/lib/email'
import { sendSms } from '@/lib/sms'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function coordinatorContact(orgId: string) {
  const { data } = await supabase.from('app_settings').select('key, value').eq('org_id', orgId).in('key', ['coordinator_email', 'coordinator_phone'])
  const m = Object.fromEntries(((data ?? []) as any[]).map(r => [r.key, r.value]))
  return {
    email: m.coordinator_email || process.env.COORDINATOR_EMAIL || null,
    phone: m.coordinator_phone || process.env.COORDINATOR_PHONE || '000000000',
  }
}

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })
  const { artistId, channels, text, replyTo } = await request.json() as {
    artistId: string
    channels: ('email' | 'sms')[]
    text: string
    replyTo?: string
  }

  if (!artistId || !text?.trim() || !Array.isArray(channels) || channels.length === 0) {
    return Response.json({ ok: false, error: 'Brak treści lub kanału' }, { status: 400 })
  }

  const { data: artist } = await supabase.from('artists').select('name').eq('org_id', orgId).eq('id', artistId).single()
  const name = artist?.name ?? 'Aktor'
  const { email, phone } = await coordinatorContact(orgId)
  const subject = replyTo ? `Odpowiedź: ${replyTo}` : `Wiadomość od ${name}`

  // 1) Najpierw ZAPISZ wiadomość (Wysłane) — żeby nigdy nie zginęła, nawet gdyby
  //    dostawca maila/SMS zawiódł.
  // Kolumna `type` ma CHECK (email/sms) — zapisujemy pojedynczy, prawidłowy kanał.
  const primaryType = channels.includes('email') ? 'email' : 'sms'
  const { error: insErr } = await supabase.from('actor_messages').insert({
    org_id: orgId,
    artist_id: artistId,
    type: primaryType,
    subject,
    body: text.trim(),
    direction: 'to_coordinator',
    kind: 'message',
    sent_at: new Date().toISOString(),
  })
  if (insErr) {
    console.error('actor reply insert:', insErr.message)
    return Response.json({ ok: false, error: 'Nie udało się zapisać wiadomości' }, { status: 500 })
  }

  // 2) Dostarczenie (best-effort) — błąd dostawcy nie wywraca zapisu.
  const delivered: string[] = []
  if (channels.includes('email') && email) {
    try {
      const ok = await sendEmail(
        email,
        `${subject} — ${name}`,
        emailWrapper(`<p style="margin:0 0 12px"><b>${escapeHtml(name)}</b> napisał(a):</p><p style="white-space:pre-wrap;margin:0">${escapeHtml(text.trim())}</p>`),
      )
      if (ok) delivered.push('email')
    } catch (e) { console.error('reply email:', e) }
  }
  if (channels.includes('sms')) {
    try {
      if (await sendSms(phone, `${name}: ${text.trim()}`)) delivered.push('sms')
    } catch (e) { console.error('reply sms:', e) }
  }

  // Zapis się udał → sukces (wiadomość jest w systemie, dostarczenie best-effort).
  return Response.json({ ok: true, delivered })
}
