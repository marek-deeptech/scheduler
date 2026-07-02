import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 7) + '-01'
  const nextMonth = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 2))
    .toISOString().slice(0, 10)

  const [
    { data: artists, error: e1 },
    { data: dayStatuses, error: e2 },
  ] = await Promise.all([
    supabase.from('artists').select('id, name').eq('org_id', orgId).order('name').limit(200),
    supabase.from('actor_day_status').select('artist_id, date, status, note').eq('org_id', orgId).gte('date', today).lte('date', nextMonth).order('date', { ascending: true }).limit(5000),
  ])

  // Build lookup map
  const artistById = new Map<string, string>(
    ((artists ?? []) as any[]).map((a: any) => [a.id, a.name])
  )

  // Resolve status list
  const statusList = ((dayStatuses ?? []) as any[]).map(s => ({
    name: artistById.get(s.artist_id) ?? `[UNKNOWN: ${s.artist_id}]`,
    date: s.date,
    status: s.status,
    note: s.note,
  }))

  // Filter by search term if provided
  const filtered = search
    ? statusList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : statusList

  // Find any UNKNOWNs (IDs not in artists table)
  const unknowns = statusList.filter(s => s.name.startsWith('[UNKNOWN'))
  const unknownIds = [...new Set(unknowns.map(s => s.name))]

  return Response.json({
    range: { today, nextMonth },
    artists_count: artists?.length ?? 0,
    artists_error: e1,
    day_statuses_total: dayStatuses?.length ?? 0,
    day_statuses_error: e2,
    unknown_artist_ids_count: unknownIds.length,
    unknown_artist_ids: unknownIds.slice(0, 5),
    // Search results (use ?search=Janda to filter)
    search_term: search || '(none - use ?search=Janda)',
    results: filtered.slice(0, 50),
  })
}
