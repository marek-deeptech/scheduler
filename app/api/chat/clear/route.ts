import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  return Response.json({ ok: true })
}
