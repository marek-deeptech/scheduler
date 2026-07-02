import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { sendEmail, emailWrapper } from '@/lib/email'
import { logMessages } from '@/lib/message-log'
import { fmtPln } from '@/lib/finance'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MONTH_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
function monthLabel(month: string): string {
  const [y, m] = month.split('-'); return `${MONTH_NOM[parseInt(m, 10) - 1]} ${y}`
}

async function financeDirectorEmail(orgId: string): Promise<string | null> {
  const { data } = await supabase.from('app_settings').select('key, value')
    .eq('org_id', orgId)
    .in('key', ['finance_director_email', 'coordinator_email'])
  const m: Record<string, string> = {}
  for (const r of data ?? []) m[r.key] = r.value ?? ''
  return m.finance_director_email || m.coordinator_email || process.env.COORDINATOR_EMAIL || null
}

export async function POST(request: Request) {
  const { month, theatreId, orgId: bodyOrgId } = await request.json() as { month: string; theatreId?: string; orgId?: string }
  if (!month?.match(/^\d{4}-\d{2}$/)) return Response.json({ ok: false, error: 'Invalid month' }, { status: 400 })

  // orgId z body (wywołanie wewnętrzne z confirmations/respond) lub z sesji (klient)
  const orgId = bodyOrgId || await sessionOrgId(request)
  if (!orgId) return Response.json({ ok: false, error: 'Brak sesji organizacji' }, { status: 401 })

  let aq = supabase
    .from('repertoire_proposals')
    .select('id, label, stats')
    .eq('org_id', orgId).eq('month', month).eq('status', 'approved')
  if (theatreId) aq = (aq as any).eq('theatre_id', theatreId)
  const { data: approved } = await aq.maybeSingle()
  if (!approved) return Response.json({ ok: false, error: 'Brak zatwierdzonego repertuaru' }, { status: 404 })

  const stats = (approved.stats ?? {}) as any
  const fin = stats.finance ?? { revenue: 0, cost: 0, margin: 0, attendance: 0 }
  const byProd: Record<string, number> = stats.by_production ?? {}
  const label = monthLabel(month)

  const to = await financeDirectorEmail(orgId)
  if (!to) return Response.json({ ok: false, error: 'Brak adresu Dyrektora Finansowego' }, { status: 400 })

  const rows = Object.entries(byProd)
    .sort((a, b) => b[1] - a[1])
    .map(([title, n]) => `<tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px">${title}</td><td style="padding:8px 0;font-size:13px;text-align:right;font-weight:600">${n} ${n === 1 ? 'spektakl' : 'spektakli'}</td></tr>`)
    .join('')

  const html = emailWrapper(`
    <h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Repertuar ${label} — zatwierdzony</h2>
    <p style="color:#6b7280;margin:0 0 20px;font-size:14px">
      Repertuar został zatwierdzony i potwierdzony przez obsadę (100% potwierdzeń). Poniżej estymacja finansowa.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:160px">Wariant</td><td style="padding:8px 0;font-size:13px;font-weight:600">${approved.label}</td></tr>
      <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Prognoza przychodu</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#15803d">${fmtPln(fin.revenue)}</td></tr>
      <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Koszty</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#b45309">${fmtPln(fin.cost)}</td></tr>
      <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Dochód</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:${fin.margin >= 0 ? '#15803d' : '#dc2626'}">${fmtPln(fin.margin)}</td></tr>
      <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Śr. frekwencja</td><td style="padding:8px 0;font-size:13px;font-weight:600">${Math.round((fin.attendance || 0) * 100)}%</td></tr>
      <tr style="border-top:1px solid #f3f4f6"><td style="padding:8px 0;font-size:13px;color:#6b7280">Liczba spektakli</td><td style="padding:8px 0;font-size:13px;font-weight:600">${stats.total ?? 0}</td></tr>
    </table>
    <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 6px">Repertuar wg tytułu</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  `)

  const subject = `[Repertuar zatwierdzony] ${label} — estymacja przychodu ${fmtPln(fin.revenue)}`
  const ok = await sendEmail(to, subject, html)

  if (ok) {
    await logMessages(supabase, [{
      artist_id: null, type: 'email', direction: 'to_coordinator', kind: 'message',
      subject, body: `Repertuar ${label} (${approved.label}): przychód ${fmtPln(fin.revenue)}, koszt ${fmtPln(fin.cost)}, dochód ${fmtPln(fin.margin)}.`,
    }], orgId)
    await supabase.from('repertoire_proposals')
      .update({ stats: { ...stats, report_sent_at: new Date().toISOString() } })
      .eq('org_id', orgId).eq('id', approved.id)
  }

  return Response.json({ ok, to })
}
