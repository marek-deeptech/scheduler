import { createClient } from '@supabase/supabase-js'

// Webhook SMSAPI (DLR — raport doręczenia SMS) → status w actor_messages.
// Aktywacja: (1) migracja delivery-status, (2) w SMSAPI ustaw URL callbacku DLR:
//     https://repertuar.vercel.app/api/webhooks/smsapi
// (3) przy wysłce SMS zapisz provider_msg_id (id z SMSAPI) — patrz lib/sms.
// SMSAPI woła callback GET-em lub POST-em z parametrami (MsgId, status).

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Mapowanie statusów SMSAPI → nasze.
function mapStatus(s: string): string {
  const v = (s || '').toUpperCase()
  if (v === 'DELIVERED') return 'delivered'
  if (v === 'UNDELIVERED' || v === 'EXPIRED' || v === 'REJECTED' || v === 'ERROR') return 'failed'
  if (v === 'SENT' || v === 'QUEUE' || v === 'ACCEPTED') return 'sent'
  return 'sent'
}

async function handle(params: URLSearchParams) {
  const msgId = params.get('MsgId') || params.get('id') || params.get('idx')
  const status = mapStatus(params.get('status') || params.get('Status') || '')
  if (!msgId) return
  await supabase.from('actor_messages')
    .update({ delivery_status: status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) })
    .eq('provider_msg_id', msgId)
}

export async function GET(req: Request) {
  try { await handle(new URL(req.url).searchParams) } catch (e) { console.error('smsapi webhook:', e) }
  return new Response('OK')
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') || ''
    const params = ct.includes('application/json')
      ? new URLSearchParams(Object.entries(await req.json()).map(([k, v]) => [k, String(v)]))
      : new URLSearchParams(await req.text())
    await handle(params)
  } catch (e) { console.error('smsapi webhook:', e) }
  return new Response('OK')
}
