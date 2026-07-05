import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { runRule, type NotificationRule } from '@/lib/notification-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Podgląd testowy pojedynczej reguły — wysyła do JEDNEGO reprezentatywnego
// odbiorcy (e-mail koordynatora), bez zapisu w notification_deliveries.
export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const { ruleId } = await request.json() as { ruleId: string }
  const { data: rule } = await supabase.from('notification_rules').select('*').eq('org_id', orgId).eq('id', ruleId).single()
  if (!rule) return Response.json({ error: 'Reguła nie znaleziona' }, { status: 404 })

  const { data: s } = await supabase.from('app_settings').select('value').eq('org_id', orgId).eq('key', 'coordinator_email').maybeSingle()
  const testEmail = (s as any)?.value ?? null

  const res = await runRule(supabase, rule as NotificationRule, new Date(), { test: true, testEmail })
  return Response.json({ ok: true, ...res, testEmail })
}
