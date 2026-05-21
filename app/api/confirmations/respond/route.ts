import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VALID_STATUSES = ['confirmed', 'declined', 'maybe'] as const
type ValidStatus = typeof VALID_STATUSES[number]

export async function POST(request: Request) {
  const { token, status, comment } = await request.json() as {
    token: string
    status: string
    comment?: string
  }

  if (!token) {
    return Response.json({ ok: false, error: 'Missing token' }, { status: 400 })
  }

  if (!VALID_STATUSES.includes(status as ValidStatus)) {
    return Response.json({ ok: false, error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('event_confirmations')
    .update({
      status,
      comment: comment ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token)
    .select('status, comment')
    .single()

  if (error || !data) {
    console.error('Respond error:', error)
    return Response.json({ ok: false, error: error?.message ?? 'Not found' }, { status: 404 })
  }

  return Response.json({ ok: true, status: data.status, comment: data.comment })
}
