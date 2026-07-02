import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })
  await supabase.from('chat_messages').delete().eq('org_id', orgId)
  return Response.json({ ok: true })
}
