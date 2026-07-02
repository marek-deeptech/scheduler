import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

export async function GET(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const theatre = searchParams.get('theatre')
  if (!month?.match(/^\d{4}-\d{2}$/)) return Response.json({ error: 'Invalid month' }, { status: 400 })

  // Zatwierdzona propozycja miesiąca (per teatr)
  let aq = supabase
    .from('repertoire_proposals')
    .select('id, label, stats, approved_at')
    .eq('org_id', orgId).eq('month', month).eq('status', 'approved')
  if (theatre) aq = (aq as any).eq('theatre_id', theatre)
  const { data: approved } = await aq.maybeSingle()

  if (!approved) return Response.json({ ok: true, approved: null })

  // Wydarzenia miesiąca (per teatr)
  const monthStart = `${month}-01T00:00:00`
  const monthEnd = `${daysInMonth(month).slice(-1)[0]}T23:59:59`
  let eq = supabase.from('events').select('id')
    .eq('org_id', orgId).gte('start_time', monthStart).lte('start_time', monthEnd)
  if (theatre) eq = (eq as any).eq('theatre_id', theatre)
  const { data: events } = await eq
  const eventIds = (events ?? []).map((e: any) => e.id)

  // Potwierdzenia
  let agg = { total: 0, confirmed: 0, declined: 0, maybe: 0, pending: 0 }
  const pendingActors = new Set<string>()
  const declinedActors = new Set<string>()
  if (eventIds.length > 0) {
    const { data: confs } = await supabase
      .from('event_confirmations')
      .select('status, artists(name)')
      .eq('org_id', orgId)
      .in('event_id', eventIds)
    for (const c of (confs ?? []) as any[]) {
      agg.total++
      const st = c.status as string
      if (st === 'confirmed') agg.confirmed++
      else if (st === 'declined') { agg.declined++; declinedActors.add((Array.isArray(c.artists) ? c.artists[0] : c.artists)?.name ?? '—') }
      else if (st === 'maybe') agg.maybe++
      else { agg.pending++; pendingActors.add((Array.isArray(c.artists) ? c.artists[0] : c.artists)?.name ?? '—') }
    }
  }

  const allConfirmed = agg.total > 0 && agg.confirmed === agg.total
  const reportSentAt = (approved.stats as any)?.report_sent_at ?? null

  return Response.json({
    ok: true,
    approved: { id: approved.id, label: approved.label, approvedAt: approved.approved_at, finance: (approved.stats as any)?.finance ?? null },
    confirmations: { ...agg, allConfirmed, pendingActors: [...pendingActors], declinedActors: [...declinedActors] },
    reportSentAt,
  })
}
