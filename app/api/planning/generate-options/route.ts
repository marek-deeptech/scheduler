import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_PARAMS, CATEGORY_DEFAULTS, fmtPln, fmtPct,
  type FinanceParams, type PriceCategory,
} from '@/lib/finance'
import {
  generateOption, OBJECTIVE_LABEL, DEFAULT_DARK_WEEKDAYS, DEFAULT_STAGE_MONTHLY_CAP,
  type Objective, type OptProduction, type OptInputs,
} from '@/lib/repertoire-optimizer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const OBJECTIVES: Objective[] = ['max_revenue', 'max_attendance', 'min_cost', 'balanced']
const BLOCKING = new Set(['Urlop', 'Niedostępny', 'Choroba'])

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

async function loadFinanceParams(): Promise<FinanceParams> {
  const { data } = await supabase.from('app_settings').select('key, value')
    .in('key', ['finance_ticket_mix', 'finance_weekend_uplift', 'finance_vat_rate', 'finance_default_attendance', 'finance_default_fixed_cost'])
  const s: Record<string, string> = {}
  for (const r of data ?? []) s[r.key] = r.value ?? ''
  const fp: FinanceParams = { ...DEFAULT_PARAMS }
  try { if (s.finance_ticket_mix) fp.ticketMix = JSON.parse(s.finance_ticket_mix) } catch {}
  if (s.finance_weekend_uplift) fp.weekendUplift = parseFloat(s.finance_weekend_uplift)
  if (s.finance_vat_rate) fp.vatRate = parseFloat(s.finance_vat_rate)
  if (s.finance_default_attendance) fp.defaultAttendance = parseFloat(s.finance_default_attendance)
  if (s.finance_default_fixed_cost) fp.defaultFixedCost = parseFloat(s.finance_default_fixed_cost)
  return fp
}

export async function POST(request: Request) {
  const { month } = await request.json() as { month: string }
  if (!month?.match(/^\d{4}-\d{2}$/)) return Response.json({ error: 'Invalid month' }, { status: 400 })

  const monthStart = `${month}-01`
  const monthEnd = daysInMonth(month).slice(-1)[0]

  const [
    { data: prods }, { data: aps }, { data: theatres }, { data: rooms },
    { data: slots }, { data: dayStatuses }, fp,
  ] = await Promise.all([
    supabase.from('productions').select('id, title, theatre_id, is_favourite, price_category, price_normal, price_reduced, price_last_minute, assumed_attendance, fixed_cost'),
    supabase.from('artist_productions').select('artist_id, production_id'),
    supabase.from('theatres').select('id'),
    supabase.from('rooms').select('id, name, theatre_id'),
    supabase.from('repertoire_slots').select('production_id, locked_dates').eq('month', month).eq('status', 'planned'),
    supabase.from('actor_day_status').select('artist_id, date, status').gte('date', monthStart).lte('date', monthEnd),
    loadFinanceParams(),
  ])

  // Konfiguracja planowania (dni ciemne, limit grań na scenę/miesiąc)
  const { data: planCfg } = await supabase.from('app_settings').select('key, value')
    .in('key', ['planning_dark_weekdays', 'planning_stage_monthly_cap'])
  const cfg: Record<string, string> = {}
  for (const r of planCfg ?? []) cfg[r.key] = r.value ?? ''
  let darkWeekdays = DEFAULT_DARK_WEEKDAYS
  try { if (cfg.planning_dark_weekdays) darkWeekdays = new Set(JSON.parse(cfg.planning_dark_weekdays)) } catch {}
  const stageMonthlyCap = cfg.planning_stage_monthly_cap ? parseInt(cfg.planning_stage_monthly_cap) : DEFAULT_STAGE_MONTHLY_CAP

  // Obsada per produkcja
  const castByProd: Record<string, string[]> = {}
  for (const ap of (aps ?? []) as any[]) (castByProd[ap.production_id] ??= []).push(ap.artist_id)

  // Mapa scena -> room_id per teatr
  const stageRoomMap: Record<string, { duza: string | null; mala: string | null }> = {}
  for (const r of (rooms ?? []) as any[]) {
    const tid = r.theatre_id; if (!tid) continue
    const n = (r.name ?? '').toLowerCase()
    const entry = stageRoomMap[tid] ??= { duza: null, mala: null }
    if (n.includes('mała') || n.includes('mala') || n.includes('cafe')) entry.mala ??= r.id
    else entry.duza ??= r.id
  }
  const stageRoom = (tid: string, stage: 'duza' | 'mala') => stageRoomMap[tid]?.[stage] ?? null

  // Produkcje z parametrami finansowymi
  const optProds: OptProduction[] = ((prods ?? []) as any[])
    .filter(p => (castByProd[p.id]?.length ?? 0) > 0 && p.theatre_id)
    .map(p => {
      const cat = (p.price_category as PriceCategory) || 'standard'
      const def = CATEGORY_DEFAULTS[cat] ?? CATEGORY_DEFAULTS.standard
      return {
        id: p.id, title: p.title, theatreId: p.theatre_id,
        category: cat, isFavourite: !!p.is_favourite,
        castIds: castByProd[p.id] ?? [],
        priceNormal: p.price_normal ?? def.normal,
        priceReduced: p.price_reduced ?? def.reduced,
        priceLastMinute: p.price_last_minute ?? def.lastMinute,
        assumedAttendance: p.assumed_attendance ?? fp.defaultAttendance,
        fixedCost: p.fixed_cost ?? fp.defaultFixedCost,
      }
    })

  // Zablokowane Favourites
  const lockedByProd: Record<string, string[]> = {}
  for (const s of (slots ?? []) as any[]) {
    if (Array.isArray(s.locked_dates) && s.locked_dates.length) lockedByProd[s.production_id] = s.locked_dates
  }

  // Niedostępności
  const unavailByDate: Record<string, Set<string>> = {}
  for (const s of (dayStatuses ?? []) as any[]) {
    if (BLOCKING.has(s.status)) (unavailByDate[s.date] ??= new Set()).add(s.artist_id)
  }

  const inp: OptInputs = {
    days: daysInMonth(month),
    theatres: ((theatres ?? []) as any[]).map(t => t.id),
    prods: optProds,
    lockedByProd, unavailByDate, finance: fp, stageRoom,
    darkWeekdays, stageMonthlyCap,
  }

  // Usuń poprzednie wersje robocze tego miesiąca
  await supabase.from('repertoire_proposals').delete().eq('month', month).eq('status', 'draft')

  const lockedCount = Object.values(lockedByProd).reduce((a, d) => a + d.length, 0)
  const summaries: any[] = []

  for (const objective of OBJECTIVES) {
    const res = generateOption(objective, inp)
    const t = res.totals
    const avgAtt = t.capacity > 0 ? t.sold / t.capacity : 0
    const reasoning =
      `Cel: ${OBJECTIVE_LABEL[objective]}. ${t.count} spektakli (w tym ${lockedCount} z zatwierdzonych Favourites). ` +
      `Prognoza: przychód ${fmtPln(t.revenue)}, koszt ${fmtPln(t.cost)}, marża ${fmtPln(t.margin)}, śr. frekwencja ${fmtPct(avgAtt)}.`

    const proposal_data = res.performances.map(p => ({
      date: p.date, production_id: p.production_id, production_title: p.production_title,
      theatre_id: p.theatre_id, room_id: p.room_id, type: 'spektakl',
      start_time: '19:00:00', end_time: '21:30:00',
    }))

    const { data: inserted } = await supabase.from('repertoire_proposals').insert({
      month, label: OBJECTIVE_LABEL[objective], status: 'draft',
      proposal_data, reasoning,
      stats: {
        total: t.count, conflicts: 0, by_production: res.byProduction,
        objective,
        finance: { revenue: t.revenue, cost: t.cost, margin: t.margin, attendance: avgAtt, locked: lockedCount },
      },
    }).select('id').single()

    summaries.push({ objective, id: inserted?.id, ...t, attendance: avgAtt })
  }

  return Response.json({ ok: true, lockedCount, options: summaries })
}
