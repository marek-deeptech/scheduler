import { createClient } from '@supabase/supabase-js'
import { runRule, isDueToday, type NotificationRule } from '@/lib/notification-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Wywoływane przez Vercel Cron (dziennie). Ocenia wszystkie aktywne reguły
// wszystkich organizacji i wysyła te „na dziś". Idempotentne (notification_deliveries).
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const { data: rules } = await supabase.from('notification_rules').select('*').eq('active', true)

  const total = { rules: 0, sent: 0, skipped: 0 }
  for (const rule of (rules ?? []) as NotificationRule[]) {
    // weekly/monthly odpalamy tylko w dniu wyzwalającym; before_event sam znajdzie wydarzenia
    if (rule.trigger_type !== 'before_event' && !isDueToday(rule, now)) continue
    try {
      const res = await runRule(supabase, rule, now)
      total.rules++; total.sent += res.sent; total.skipped += res.skipped
    } catch (e) {
      console.error('notification rule failed', rule.id, e)
    }
  }
  return Response.json({ ok: true, ...total })
}
