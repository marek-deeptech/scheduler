import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_PARAMS, CATEGORY_DEFAULTS, fmtPln, fmtPct,
  scenesForTheatre, mapRoomsToScenes,
  type FinanceParams, type PriceCategory, type Stage,
} from '@/lib/finance'
import {
  generateOption, OBJECTIVE_LABEL,
  type Objective, type OptProduction, type OptInputs,
} from '@/lib/repertoire-optimizer'
import { profileFor, buildSlots, BASE_VARIANT } from '@/lib/repertoire-base'
import { sessionOrgId } from '@/lib/session-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OBJECTIVES: Objective[] = ['max_revenue', 'max_attendance', 'min_cost', 'balanced']
const BLOCKING = new Set(['Urlop', 'Niedostępny', 'Choroba'])

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

async function loadFinanceParams(orgId: string): Promise<FinanceParams> {
  const { data } = await supabase.from('app_settings').select('key, value')
    .eq('org_id', orgId)
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
  const { month, theatreId, useCore = false, useSlots = false } = await request.json() as
    { month: string; theatreId?: string; constraints?: string; useCore?: boolean; useSlots?: boolean }
  if (!month?.match(/^\d{4}-\d{2}$/)) return Response.json({ error: 'Invalid month' }, { status: 400 })
  if (!theatreId) return Response.json({ error: 'Wybierz teatr (Polonia lub Och) — repertuar planowany jest osobno dla każdego teatru.' }, { status: 400 })

  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const monthStart = `${month}-01`
  const monthEnd = daysInMonth(month).slice(-1)[0]

  const [
    { data: prods }, { data: aps }, { data: theatres }, { data: rooms },
    { data: slots }, { data: dayStatuses }, { data: otherEvents }, fp,
  ] = await Promise.all([
    (async () => {
      // Tolerancyjnie na brak migracji 'stage' / 'setup-teardown' — ponawiamy z mniejszym zestawem kolumn.
      const base = 'id, title, theatre_id, is_favourite, price_category, price_normal, price_reduced, price_last_minute, assumed_attendance, fixed_cost'
      const q = (cols: string) => supabase.from('productions').select(cols).eq('org_id', orgId)
      let r = await q(`${base}, stage, setup_days, teardown_days`)
      if (r.error) r = await q(`${base}, setup_days, teardown_days`)
      if (r.error) r = await q(`${base}, stage`)
      if (r.error) r = await q(base)
      return r
    })(),
    supabase.from('artist_productions').select('artist_id, production_id').eq('org_id', orgId),
    supabase.from('theatres').select('id, name').eq('org_id', orgId),
    supabase.from('rooms').select('id, name, theatre_id').eq('org_id', orgId),
    supabase.from('repertoire_slots').select('production_id, locked_dates, productions(theatre_id)').eq('org_id', orgId).eq('month', month).eq('status', 'planned'),
    supabase.from('actor_day_status').select('artist_id, date, status').eq('org_id', orgId).gte('date', monthStart).lte('date', monthEnd),
    // Wydarzenia INNYCH teatrów TEJ SAMEJ org w tym miesiącu — zajętość wspólnych aktorów
    supabase.from('events').select('start_time, production_id, theatre_id').eq('org_id', orgId)
      .gte('start_time', `${monthStart}T00:00:00`).lte('start_time', `${monthEnd}T23:59:59`)
      .neq('theatre_id', theatreId),
    loadFinanceParams(orgId),
  ])

  // Obsada per produkcja
  const castByProd: Record<string, string[]> = {}
  for (const ap of (aps ?? []) as any[]) (castByProd[ap.production_id] ??= []).push(ap.artist_id)

  // Mapa scena -> room_id per teatr (2 sceny Fundacji lub 3 sceny TD)
  const roomsByTheatre: Record<string, { id: string; name: string | null }[]> = {}
  for (const r of (rooms ?? []) as any[]) {
    const tid = r.theatre_id; if (!tid) continue
    ;(roomsByTheatre[tid] ??= []).push({ id: r.id, name: r.name })
  }
  const stageRoomMap: Record<string, Record<string, string | null>> = {}
  for (const [tid, trooms] of Object.entries(roomsByTheatre)) {
    stageRoomMap[tid] = mapRoomsToScenes(scenesForTheatre(tid), trooms)
  }
  const stageRoom = (tid: string, stage: Stage) => stageRoomMap[tid]?.[stage] ?? null

  // Produkcje z parametrami finansowymi — TYLKO wybrany teatr
  const optProds: OptProduction[] = ((prods ?? []) as any[])
    .filter(p => (castByProd[p.id]?.length ?? 0) > 0 && p.theatre_id === theatreId)
    .map(p => {
      const cat = (p.price_category as PriceCategory) || 'standard'
      const stage: Stage = p.stage ?? 'duza'
      const def = CATEGORY_DEFAULTS[cat] ?? CATEGORY_DEFAULTS.standard
      return {
        id: p.id, title: p.title, theatreId: p.theatre_id,
        stage, category: cat, isFavourite: !!p.is_favourite,
        castIds: castByProd[p.id] ?? [],
        priceNormal: p.price_normal ?? def.normal,
        priceReduced: p.price_reduced ?? def.reduced,
        priceLastMinute: p.price_last_minute ?? def.lastMinute,
        assumedAttendance: p.assumed_attendance ?? fp.defaultAttendance,
        fixedCost: p.fixed_cost ?? fp.defaultFixedCost,
        setup: p.setup_days ?? 0,
        teardown: p.teardown_days ?? 0,
      }
    })

  // Niedostępności (urlop/choroba)
  const unavailByDate: Record<string, Set<string>> = {}
  for (const s of (dayStatuses ?? []) as any[]) {
    if (BLOCKING.has(s.status)) (unavailByDate[s.date] ??= new Set()).add(s.artist_id)
  }

  // Zablokowane Favourites — TEGO teatru placujemy; INNYCH teatrów = zajętość krzyżowa
  const lockedByProd: Record<string, string[]> = {}
  for (const s of (slots ?? []) as any[]) {
    if (!Array.isArray(s.locked_dates) || !s.locked_dates.length) continue
    const prodTheatre = (Array.isArray(s.productions) ? s.productions[0] : s.productions)?.theatre_id
    if (prodTheatre === theatreId) {
      // Sloty Favourites jako stałe tylko gdy warunek włączony (zadanie 3, domyślnie OFF)
      if (useSlots) lockedByProd[s.production_id] = s.locked_dates
    } else {
      // wspólni aktorzy zajęci w innym teatrze w te dni
      for (const aid of castByProd[s.production_id] ?? []) {
        for (const d of s.locked_dates) (unavailByDate[d] ??= new Set()).add(aid)
      }
    }
  }

  // Zatwierdzony repertuar innych teatrów (wydarzenia) — zajętość wspólnych aktorów
  for (const ev of (otherEvents ?? []) as any[]) {
    const date = String(ev.start_time).slice(0, 10)
    for (const aid of castByProd[ev.production_id] ?? []) {
      (unavailByDate[date] ??= new Set()).add(aid)
    }
  }

  // Dostępność aktorów CORE — twarde blokady (warunek c, gdy włączony).
  if (useCore) {
    const core = await supabase.from('artists').select('id, is_core').eq('org_id', orgId).eq('is_core', true)
    const coreIds = core.error ? [] : ((core.data ?? []) as any[]).map(a => a.id)
    if (coreIds.length) {
      const { data: av } = await supabase.from('availabilities').select('artist_id, start_time, end_time')
        .eq('org_id', orgId).in('artist_id', coreIds).lte('start_time', `${monthEnd}T23:59:59`).gte('end_time', `${monthStart}T00:00:00`)
      for (const a of (av ?? []) as any[]) {
        const e = new Date(`${String(a.end_time).slice(0, 10)}T12:00:00Z`)
        for (let d = new Date(`${String(a.start_time).slice(0, 10)}T12:00:00Z`); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10)
          if (ds >= monthStart && ds <= monthEnd) (unavailByDate[ds] ??= new Set()).add(a.artist_id)
        }
      }
    }
  }

  // Bazowy kształt (empiryczny rytm per teatr) — finanse/Favourites/CORE go modyfikują.
  const theatreName = ((theatres ?? []) as any[]).find(t => t.id === theatreId)?.name ?? ''
  const profile = profileFor(theatreName)
  const baseSlots = buildSlots(BASE_VARIANT, month, profile)

  // Wynajem sceny TEGO teatru — blokuje scenę na dany dzień (auto-repertuar ją omija)
  const stageByRoomId: Record<string, string> = {}
  for (const [stg, rid] of Object.entries(stageRoomMap[theatreId] ?? {})) if (rid) stageByRoomId[rid] = stg
  const { data: rentals } = await supabase.from('events')
    .select('room_id, start_time').eq('org_id', orgId).eq('theatre_id', theatreId).eq('type', 'Wynajem sceny')
    .gte('start_time', `${monthStart}T00:00:00`).lte('start_time', `${monthEnd}T23:59:59`)
  const rentedStageByDate: Record<string, Set<string>> = {}
  for (const r of (rentals ?? []) as any[]) {
    const stg = r.room_id ? stageByRoomId[r.room_id] : null
    if (!stg) continue
    ;(rentedStageByDate[String(r.start_time).slice(0, 10)] ??= new Set()).add(stg)
  }

  const inp: OptInputs = {
    slots: baseSlots,
    theatres: [theatreId],            // generujemy TYLKO dla wybranego teatru
    prods: optProds,
    lockedByProd, unavailByDate, finance: fp, stageRoom, rentedStageByDate,
  }

  // Usuń poprzednie wersje robocze tego miesiąca DLA TEGO TEATRU (w ramach org)
  await supabase.from('repertoire_proposals').delete()
    .eq('org_id', orgId).eq('month', month).eq('status', 'draft').eq('theatre_id', theatreId)

  const lockedCount = Object.values(lockedByProd).reduce((a, d) => a + d.length, 0)
  const summaries: any[] = []

  for (const objective of OBJECTIVES) {
    const res = generateOption(objective, inp)
    const t = res.totals
    const avgAtt = t.capacity > 0 ? t.sold / t.capacity : 0
    const reasoning =
      `Cel: ${OBJECTIVE_LABEL[objective]}. ${t.count} spektakli (w tym ${lockedCount} z zatwierdzonych Favourites). ` +
      `Prognoza: przychód ${fmtPln(t.revenue)}, koszt ${fmtPln(t.cost)}, dochód ${fmtPln(t.margin)}, śr. frekwencja ${fmtPct(avgAtt)}.`

    const proposal_data = res.performances.map(p => ({
      date: p.date, production_id: p.production_id, production_title: p.production_title,
      theatre_id: p.theatre_id, room_id: p.room_id, type: 'spektakl',
      start_time: p.start_time, end_time: p.end_time,
    }))

    const { data: inserted } = await supabase.from('repertoire_proposals').insert({
      org_id: orgId, month, theatre_id: theatreId, label: OBJECTIVE_LABEL[objective], status: 'draft',
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
