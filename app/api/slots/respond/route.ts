import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const { token, availability } = await request.json() as {
    token: string
    availability: { date: string; available: boolean }[]
  }

  if (!token || !Array.isArray(availability)) {
    return Response.json({ ok: false, error: 'Missing token or availability' }, { status: 400 })
  }

  const { data: invite, error: invErr } = await supabase
    .from('slot_invites')
    .select('slot_id, artist_id')
    .eq('token', token)
    .single()

  if (invErr || !invite) {
    return Response.json({ ok: false, error: 'Invalid token' }, { status: 404 })
  }

  // Zastąp poprzednie odpowiedzi tego aktora dla tego slotu
  await supabase
    .from('slot_availability')
    .delete()
    .eq('slot_id', invite.slot_id)
    .eq('artist_id', invite.artist_id)

  const rows = availability.map(a => ({
    slot_id: invite.slot_id,
    artist_id: invite.artist_id,
    date: a.date,
    available: a.available,
  }))

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('slot_availability').insert(rows)
    if (insErr) return Response.json({ ok: false, error: insErr.message }, { status: 500 })
  }

  await supabase
    .from('slot_invites')
    .update({ submitted_at: new Date().toISOString() })
    .eq('token', token)

  const availableCount = availability.filter(a => a.available).length
  return Response.json({ ok: true, availableCount })
}
