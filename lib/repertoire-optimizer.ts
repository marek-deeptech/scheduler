// Generator repertuaru — ścieżka FINANSOWA. Startuje z bazowego kształtu
// (empiryczne sloty z lib/repertoire-base: kiedy/ile spektakli, poranki, pn-light,
// granie w święta) i DOBIERA tytuły do tych slotów wg celu finansowego.
// Czyli: finanse / Favourites / CORE MODYFIKUJĄ bazowy wzorzec, nie zastępują go.
//  • zatwierdzone Favourites = twarda zajętość (wieczór),
//  • reszta slotów wypełniana greedy pod cel (przychód / frekwencja / koszt / dochód),
//  • bonus za kontynuację tytułu na sąsiednim dniu (bloki 2-dniowe).

import {
  stageCapacity, asp, isWeekend,
  type PriceCategory, type Stage, type FinanceParams,
} from './finance'
import { prevDate, changeoverOk, type Slot } from './repertoire-base'

export type Objective = 'max_revenue' | 'max_attendance' | 'min_cost' | 'balanced'

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  max_revenue:    'Maks. przychód',
  max_attendance: 'Maks. frekwencja',
  min_cost:       'Min. koszt',
  balanced:       'Zbalansowana',
}

export interface OptProduction {
  id: string
  title: string
  theatreId: string
  stage: Stage
  category: PriceCategory
  isFavourite: boolean
  aspOverride?: number      // ASP z rodzajów biletów (pricing.asp)
  castIds: string[]
  priceNormal: number
  priceReduced: number
  priceLastMinute: number
  assumedAttendance: number
  fixedCost: number
  setup: number      // montaż scenografii (dni robocze)
  teardown: number   // demontaż scenografii (dni robocze)
}

export interface OptInputs {
  slots: Slot[]                               // empiryczne sloty (data × pora) z bazowego wzorca
  theatres: string[]                          // theatre ids (jeden — planujemy per teatr)
  prods: OptProduction[]
  lockedByProd: Record<string, string[]>      // production_id -> zatwierdzone daty (Favourites)
  unavailByDate: Record<string, Set<string>>  // data -> artistId niedostępni (urlop/choroba/CORE)
  finance: FinanceParams
  stageRoom: (theatreId: string, stage: Stage) => string | null // -> room_id
  rentedStageByDate?: Record<string, Set<string>>  // data -> sceny zablokowane wynajmem
  dublersByProd?: Record<string, string[]>          // production_id -> id dublerów (gotowość gdy tytuł grany)
  seasonalByTitle?: Record<string, number>          // tytuł -> dopasowanie do miesiąca [-1,1] (z historii)
}

// Waga sezonowości w doborze tytułu — nudge ±35%, bez zmiany znaku scoringu.
export const SEASON_W = 0.35

export interface Perf {
  date: string
  production_id: string
  production_title: string
  theatre_id: string
  room_id: string | null
  type: string
  start_time: string   // 'HH:MM:SS'
  end_time: string     // 'HH:MM:SS'
}

export interface OptionResult {
  objective: Objective
  performances: Perf[]
  totals: { revenue: number; cost: number; margin: number; sold: number; capacity: number; count: number }
  byProduction: Record<string, number>
}

// Limit grań tytułu/miesiąc — empirycznie ~2 (Polonia) / ~2,4 (Och). Trzymamy
// realną różnorodność (~12–15 tytułów), a cel finansowy decyduje KTÓRE tytuły.
const NONFAV_CAP_DEFAULT = 2
const NONFAV_CAP_MINCOST = 2
const BLOCK_CAP = 2   // maks. długość bloku kolejnych dni; po nim tytuł odpoczywa

function perfFinance(p: OptProduction, date: string, fp: FinanceParams) {
  const cap = stageCapacity(p.stage, p.theatreId)
  const attendance = p.isFavourite
    ? 1
    : Math.min(1, p.assumedAttendance * (isWeekend(date + 'T12:00:00') ? 1 + fp.weekendUplift : 1))
  const sold = Math.round(cap * attendance)
  const aspG = asp(p, fp.ticketMix)
  const revenue = sold * aspG
  const cost = p.fixedCost
  return { cap, attendance, sold, revenue, cost, margin: revenue - cost }
}

export function generateOption(objective: Objective, inp: OptInputs): OptionResult {
  const theatre = inp.theatres[0]
  const usedSlot = new Set<string>()                 // `${date}|${start}`
  const castBusy = new Map<string, Set<string>>()    // date -> artistId zajęci (grają)
  const standby  = new Map<string, Set<string>>()    // date -> artistId w gotowości jako dubler
  const titleCount = new Map<string, number>()
  const lastDate = new Map<string, string>()         // prodId -> ostatni dzień grania
  const runLen   = new Map<string, number>()         // prodId -> długość bieżącego bloku
  // Stan sceny (montaż/demontaż): ostatni tytuł na scenie i jego demontaż.
  // Klucz = dowolny `stage` (2 sceny Fundacji lub 3 sceny TD) — mapa dynamiczna.
  const stageState: Record<string, { date: string; title: string; teardown: number } | undefined> = {}
  const perfs: Perf[] = []
  const prodById: Record<string, OptProduction> = {}
  inp.prods.forEach(p => prodById[p.id] = p)

  const cap = objective === 'min_cost' ? NONFAV_CAP_MINCOST : NONFAV_CAP_DEFAULT

  function busyOf(date: string): Set<string> {
    let s = castBusy.get(date)
    if (!s) { s = new Set<string>(); castBusy.set(date, s) }
    return s
  }
  function standbyOf(date: string): Set<string> {
    let s = standby.get(date)
    if (!s) { s = new Set<string>(); standby.set(date, s) }
    return s
  }
  function place(p: OptProduction, date: string, start: string, end: string) {
    perfs.push({
      date, production_id: p.id, production_title: p.title,
      theatre_id: p.theatreId, room_id: inp.stageRoom(p.theatreId, p.stage),
      type: 'spektakl', start_time: start, end_time: end,
    })
    usedSlot.add(`${date}|${start}`)
    const bs = busyOf(date); for (const a of p.castIds) bs.add(a)
    const sb = standbyOf(date); for (const a of (inp.dublersByProd?.[p.id] ?? [])) sb.add(a)
    titleCount.set(p.id, (titleCount.get(p.id) ?? 0) + 1)
    runLen.set(p.id, (lastDate.get(p.id) === prevDate(date) ? (runLen.get(p.id) ?? 0) : 0) + 1)
    lastDate.set(p.id, date)
    stageState[p.stage] = { date, title: p.id, teardown: p.teardown }
  }

  // Scena wolna dla tytułu p w dniu D: ten sam tytuł kontynuuje albo minął
  // demontaż poprzedniego + montaż p (dni robocze).
  function stageFree(p: OptProduction, date: string): boolean {
    const st = stageState[p.stage]
    if (!st) return true
    if (st.title === p.id && st.date === prevDate(date)) return true  // kontynuacja bloku (kolejny dzień)
    return changeoverOk({ date: st.date, teardown: st.teardown }, date, p.setup)
  }

  // Przetwarzanie CHRONOLOGICZNE (by montaż/demontaż i bloki liczyły się poprawnie):
  // najpierw zablokowane Favourites danego dnia (twardo, wieczór), potem pozostałe sloty.
  const favByDate = new Map<string, string[]>()
  for (const [pid, dates] of Object.entries(inp.lockedByProd)) {
    if (!prodById[pid]) continue
    for (const d of dates) { const arr = favByDate.get(d) ?? []; arr.push(pid); favByDate.set(d, arr) }
  }
  const slotsByDate = new Map<string, Slot[]>()
  for (const s of inp.slots) { const arr = slotsByDate.get(s.date) ?? []; arr.push(s); slotsByDate.set(s.date, arr) }
  const allDates = [...new Set([...favByDate.keys(), ...slotsByDate.keys()])].sort()

  for (const date of allDates) {
    // a) Favourites (zatwierdzone, twarda zajętość wieczoru)
    for (const pid of favByDate.get(date) ?? []) {
      const p = prodById[pid]
      if (!p || usedSlot.has(`${date}|19:00:00`)) continue
      place(p, date, '19:00:00', '21:30:00')
    }
    // b) Pozostałe sloty tego dnia — wg celu finansowego
    for (const slot of slotsByDate.get(date) ?? []) {
      if (usedSlot.has(`${date}|${slot.start}`)) continue   // np. zajęty przez Favourite
      const busy = busyOf(date)
      const sb   = standbyOf(date)
      const unav = inp.unavailByDate[date] ?? new Set<string>()
      const yd = prevDate(date)

      const cands = inp.prods.filter(p =>
        !p.isFavourite &&
        p.theatreId === theatre &&
        p.castIds.length > 0 &&
        (titleCount.get(p.id) ?? 0) < cap &&
        !(lastDate.get(p.id) === yd && (runLen.get(p.id) ?? 0) >= BLOCK_CAP) && // po bloku — odpoczynek
        !(inp.rentedStageByDate?.[date]?.has(p.stage)) && // scena zablokowana wynajmem
        stageFree(p, date) &&                        // scena wolna (montaż/demontaż)
        p.castIds.every(a => !busy.has(a)) &&        // brak konfliktu obsady tego dnia
        p.castIds.every(a => !sb.has(a)) &&          // obsada nie jest na standby jako dubler innego tytułu
        (inp.dublersByProd?.[p.id] ?? []).every(a => !busy.has(a)) && // dubler tego tytułu nie gra gdzie indziej
        p.castIds.every(a => !unav.has(a))           // pełna obsada dostępna (urlop/choroba/CORE)
      )
      if (cands.length === 0) continue

      const scored = cands.map(p => {
        const fin = perfFinance(p, date, inp.finance)
        let base =
          objective === 'max_revenue'    ? fin.revenue :
          objective === 'max_attendance' ? fin.attendance * 100000 :
          objective === 'min_cost'       ? -fin.cost :
                                           fin.margin
        // bonus blokowy: kontynuacja tytułu z wczoraj, dopóki blok < BLOCK_CAP
        if (lastDate.get(p.id) === yd && (runLen.get(p.id) ?? 0) < BLOCK_CAP) base *= 1.25
        // sezonowość: tytuł historycznie (nie)typowy dla tego miesiąca — nudge ±35%
        const aff = inp.seasonalByTitle?.[p.title] ?? 0
        if (aff) base *= 1 + SEASON_W * aff
        return { p, fin, score: base }
      })

      let pool = scored
      if (objective === 'min_cost') pool = pool.filter(s => s.fin.margin > 0)
      if (pool.length === 0) continue
      pool.sort((a, b) => b.score - a.score)
      place(pool[0].p, date, slot.start, slot.end)
    }
  }

  // Totals
  const totals = { revenue: 0, cost: 0, margin: 0, sold: 0, capacity: 0, count: 0 }
  const byProduction: Record<string, number> = {}
  for (const perf of perfs) {
    const p = prodById[perf.production_id]
    if (!p) continue
    const fin = perfFinance(p, perf.date, inp.finance)
    totals.revenue += fin.revenue; totals.cost += fin.cost
    totals.sold += fin.sold; totals.capacity += fin.cap; totals.count++
    byProduction[perf.production_title] = (byProduction[perf.production_title] ?? 0) + 1
  }
  totals.margin = totals.revenue - totals.cost

  perfs.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  return { objective, performances: perfs, totals, byProduction }
}
