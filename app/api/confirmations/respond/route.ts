import { createClient } from '@supabase/supabase-js'
import { getBaseUrl } from '@/lib/base-url'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_STATUSES = ['confirmed', 'declined', 'maybe'] as const
type ValidStatus = typeof VALID_STATUSES[number]


function monthOf(iso: string): string { return iso.slice(0, 7) }
function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

// Etap 6: po 100% potwierdzeń dla zatwierdzonego miesiąca — automatyczny raport
// do Dyrektora Finansowego (guard: report_sent_at na zatwierdzonej propozycji).
async function maybeTriggerFinanceReport(eventId: string, baseUrl: string, orgId: string) {
  try {
    const { data: ev } = await supabase.from('events').select('start_time, theatre_id').eq('org_id', orgId).eq('id', eventId).single()
    if (!ev?.start_time) return
    const month = monthOf(ev.start_time)
    const theatreId = ev.theatre_id as string | null

    let aq = supabase.from('repertoire_proposals').select('id, stats')
      .eq('org_id', orgId).eq('month', month).eq('status', 'approved')
    if (theatreId) aq = (aq as any).eq('theatre_id', theatreId)
    const { data: approved } = await aq.maybeSingle()
    if (!approved) return
    if ((approved.stats as any)?.report_sent_at) return // już wysłany

    let eq = supabase.from('events').select('id')
      .eq('org_id', orgId).gte('start_time', `${month}-01T00:00:00`).lte('start_time', `${lastDay(month)}T23:59:59`)
    if (theatreId) eq = (eq as any).eq('theatre_id', theatreId)
    const { data: events } = await eq
    const ids = (events ?? []).map((e: any) => e.id)
    if (ids.length === 0) return

    const { data: confs } = await supabase.from('event_confirmations').select('status').eq('org_id', orgId).in('event_id', ids)
    const all = confs ?? []
    if (all.length === 0 || !all.every((c: any) => c.status === 'confirmed')) return

    // 100% potwierdzeń dla teatru — wyślij raport
    await fetch(`${baseUrl}/api/planning/send-finance-report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, theatreId, orgId }),
    })
  } catch (e) {
    console.error('maybeTriggerFinanceReport:', e)
  }
}

// Publiczny odczyt szczegółów potwierdzenia po tokenie (zamiast anon z przeglądarki).
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return Response.json({ error: 'Missing token' }, { status: 400 })
  const { data, error } = await supabase
    .from('event_confirmations')
    .select(`
      id, token, status, comment,
      events!event_id (
        title, type, start_time, end_time,
        productions (title),
        rooms (name)
      ),
      artists!artist_id (name)
    `)
    .eq('token', token)
    .single()
  if (error || !data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ data })
}

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
    .select('status, comment, event_id, org_id')
    .single()

  if (error || !data) {
    console.error('Respond error:', error)
    return Response.json({ ok: false, error: error?.message ?? 'Not found' }, { status: 404 })
  }

  // Etap 6 — auto-raport gdy ten potwierdzony dopełnia 100% miesiąca
  if (data.status === 'confirmed' && (data as any).event_id && (data as any).org_id) {
    await maybeTriggerFinanceReport((data as any).event_id, getBaseUrl(request), (data as any).org_id)
  }

  return Response.json({ ok: true, status: data.status, comment: data.comment })
}
