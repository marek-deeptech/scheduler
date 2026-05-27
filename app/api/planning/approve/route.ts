import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const { proposalId, action } = await request.json() as {
    proposalId: string
    action: 'approve' | 'reject'
  }

  if (!proposalId) return Response.json({ error: 'Missing proposalId' }, { status: 400 })

  // ── Reject ───────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { error } = await supabase
      .from('repertoire_proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  const { data: proposal, error: fetchErr } = await supabase
    .from('repertoire_proposals')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (fetchErr || !proposal) {
    return Response.json({ error: 'Proposal not found' }, { status: 404 })
  }

  // Insert events into calendar
  const events = ((proposal.proposal_data ?? []) as any[]).map(e => ({
    title: e.production_title,
    type: e.type ?? 'spektakl',
    start_time: `${e.date}T${e.start_time ?? '19:00:00'}`,
    end_time:   `${e.date}T${e.end_time   ?? '21:30:00'}`,
    production_id: e.production_id ?? null,
    room_id:       e.room_id       ?? null,
  }))

  if (events.length > 0) {
    const { error: insertErr } = await supabase.from('events').insert(events)
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // Mark this proposal approved
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', proposalId)

  // Reject other drafts for same month
  await supabase
    .from('repertoire_proposals')
    .update({ status: 'rejected' })
    .eq('month', proposal.month)
    .neq('id', proposalId)
    .eq('status', 'draft')

  return Response.json({ ok: true, eventsCreated: events.length })
}
