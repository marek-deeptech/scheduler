import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Publiczny odczyt zaproszenia + dotychczasowych odpowiedzi po tokenie.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return Response.json({ error: 'Missing token' }, { status: 400 })

  const { data: invite, error } = await supabase
    .from('slot_invites')
    .select('slot_id, artist_id, submitted_at, artists(name), repertoire_slots(window_start, window_end, target_performances, productions(title))')
    .eq('token', token)
    .single()
  if (error || !invite) return Response.json({ error: 'Not found' }, { status: 404 })

  const inv = invite as any
  const slot = Array.isArray(inv.repertoire_slots) ? inv.repertoire_slots[0] : inv.repertoire_slots
  const artist = Array.isArray(inv.artists) ? inv.artists[0] : inv.artists
  const prod = Array.isArray(slot?.productions) ? slot.productions[0] : slot?.productions

  const { data: existing } = await supabase
    .from('slot_availability')
    .select('date, available')
    .eq('slot_id', inv.slot_id)
    .eq('artist_id', inv.artist_id)

  return Response.json({
    data: {
      slotId: inv.slot_id,
      artistId: inv.artist_id,
      artistName: artist?.name ?? '—',
      title: prod?.title ?? 'Spektakl',
      windowStart: slot?.window_start,
      windowEnd: slot?.window_end,
      target: slot?.target_performances ?? 4,
      submittedAt: inv.submitted_at,
    },
    availability: existing ?? [],
  })
}

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
    .select('slot_id, artist_id, org_id')
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
    org_id: (invite as any).org_id,
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
