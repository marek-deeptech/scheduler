import { createClient } from '@supabase/supabase-js'

// Webhook Resend → aktualizuje status doręczenia e-maili w actor_messages.
// Aktywacja: (1) uruchom supabase-migration-delivery-status.sql,
// (2) zweryfikuj domenę w Resend, (3) w Resend → Webhooks ustaw URL:
//     https://repertuar.vercel.app/api/webhooks/resend (zdarzenia email.*),
// (4) przy wysyłce zapisz provider_msg_id (id z Resend) — patrz lib/email.
// Dopóki provider_msg_id nie jest zapisywany przy wysyłce, webhook nie ma czego dopasować.

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STATUS: Record<string, string> = {
  'email.sent':      'sent',
  'email.delivered': 'delivered',
  'email.opened':    'opened',
  'email.bounced':   'bounced',
  'email.complained':'complained',
  'email.delivery_delayed': 'delayed',
}

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const type = payload?.type as string
    const emailId = payload?.data?.email_id ?? payload?.data?.id
    const status = STATUS[type]
    if (!emailId || !status) return Response.json({ ok: true, ignored: true })

    await supabase.from('actor_messages')
      .update({ delivery_status: status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) })
      .eq('provider_msg_id', emailId)
  } catch (e) {
    console.error('resend webhook:', e)
  }
  return Response.json({ ok: true })
}
