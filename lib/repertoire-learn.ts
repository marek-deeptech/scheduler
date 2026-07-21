// ── UCZENIE PROFILU REPERTUARU Z HISTORII ────────────────────────────────────
// Zamiast stałego `profileFor()` (zaszyty kształt), wyprowadzamy „profil" teatru
// z jego WŁASNYCH przeszłych repertuarów wprowadzonych do sprzedaży. Uczymy:
//   • gęstość — ile DNI grania w miesiącu (mediana),
//   • rytm tygodnia — waga dni (pn ciemny? weekend cięższy?) → dowW,
//   • godziny grania — dominujące pory wieczorne (ile scen równolegle) + poranki,
//   • odsetek poranków (ndz/sob/dzień roboczy),
//   • sezonowość — korelacja tytuł ↔ miesiąc roku (np. tytuł zwykle w grudniu).
// Gdy historii za mało — zwracamy profil bazowy (fallback) bez zmian.

import type { Profile } from './repertoire-base'

export interface PastItem {
  date:             string          // 'YYYY-MM-DD'
  start_time:       string          // 'HH:MM:SS'
  end_time?:        string | null
  production_title?: string | null
  production_id?:   string | null
}
export interface PastMonth { month: string; items: PastItem[] }

export interface Seasonality {
  /** Dopasowanie tytułu do miesiąca (1–12) względem jego typowego rozkładu; [-1, 1]. */
  affinity(title: string, monthIdx: number): number
}

export interface LearnBasis { months: number; shows: number; sourceMonths: string[] }
export interface LearnResult {
  profile:     Profile
  seasonality: Seasonality
  basis:       LearnBasis
  learned:     boolean              // false → zwrócono fallback (za mało historii)
}

const EVE_CUTOFF = '16:30:00'       // start ≥ to = spektakl wieczorny; < to = poranek/popołudniówka
const ZERO_SEASON: Seasonality = { affinity: () => 0 }

const hm = (t: string) => (t || '').slice(0, 8).padEnd(8, '0')          // 'HH:MM:SS'
const dowOf = (date: string) => new Date(date + 'T12:00:00').getDay()   // 0=Ndz … 6=Sob
const monthOf = (date: string) => Number(date.slice(5, 7))              // 1–12
const addHours = (t: string, h: number) => {
  const [H, M] = t.split(':').map(Number)
  return `${String((H + h) % 24).padStart(2, '0')}:${String(M).padStart(2, '0')}:00`
}
function mode<T>(arr: T[]): T | undefined {
  const c = new Map<T, number>()
  for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1)
  let best: T | undefined, n = -1
  for (const [k, v] of c) if (v > n) { n = v; best = k }
  return best
}
function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Wyprowadza profil + sezonowość z przeszłych repertuarów (sold).
 * @param past      miesiące-wzorce (proposal_data zatwierdzonych, wprowadzonych do sprzedaży)
 * @param fallback  profil bazowy (profileFor) — używany gdy za mało historii / brak danych cząstkowych
 * @param opts.minMonths  minimalna liczba miesięcy-wzorców, by uczyć (domyślnie 2)
 */
export function learnProfile(
  past: PastMonth[],
  fallback: Profile,
  opts: { minMonths?: number } = {},
): LearnResult {
  const minMonths = opts.minMonths ?? 2
  const months = (past ?? []).filter(m => (m.items?.length ?? 0) > 0)
  const totalShows = months.reduce((s, m) => s + m.items.length, 0)
  const basis: LearnBasis = { months: months.length, shows: totalShows, sourceMonths: months.map(m => m.month) }

  if (months.length < minMonths) {
    return { profile: fallback, seasonality: ZERO_SEASON, basis, learned: false }
  }

  // ── Gęstość: mediana liczby DNI grania na miesiąc ──────────────────────────
  const playingDaysPerMonth = months.map(m => new Set(m.items.map(i => i.date)).size)
  const eveningTarget = Math.max(1, Math.round(median(playingDaysPerMonth)))

  // Zbierz wszystkie spektakle
  const all = months.flatMap(m => m.items)

  // ── Rytm tygodnia (dowW): skłonność do grania danego dnia tygodnia ─────────
  // playRate[d] = (# różnych dat tego dnia z ≥1 spektaklem) / (# wszystkich dat tego
  // dnia w oknach źródłowych). Normalizujemy do średniej 1 (jak stała DOW_W).
  const playedDatesByDow: Record<number, Set<string>> = {}
  for (const it of all) (playedDatesByDow[dowOf(it.date)] ??= new Set()).add(it.date)
  const calDatesByDow: Record<number, number> = {}
  for (const m of months) {
    const [y, mm] = m.month.split('-').map(Number)
    const days = new Date(y, mm, 0).getDate()
    for (let d = 1; d <= days; d++) {
      const dow = new Date(y, mm - 1, d, 12).getDay()
      calDatesByDow[dow] = (calDatesByDow[dow] ?? 0) + 1
    }
  }
  const rawRate: Record<number, number> = {}
  for (let d = 0; d <= 6; d++) {
    const cal = calDatesByDow[d] ?? 0
    rawRate[d] = cal > 0 ? (playedDatesByDow[d]?.size ?? 0) / cal : 0
  }
  const meanRate = Object.values(rawRate).reduce((a, b) => a + b, 0) / 7 || 1
  const dowW: Record<number, number> = {}
  for (let d = 0; d <= 6; d++) dowW[d] = meanRate > 0 ? +(rawRate[d] / meanRate).toFixed(3) : 1

  // ── Godziny wieczorne + ile scen równolegle (eveSlots) ─────────────────────
  const eveItems = all.filter(i => hm(i.start_time) >= EVE_CUTOFF)
  let eveSlots: Array<[string, string]> = fallback.eveSlots
  if (eveItems.length) {
    // ile równoległych scen wieczorem: mediana liczby spektakli wieczornych na dzień grania
    const eveByDate: Record<string, number> = {}
    for (const it of eveItems) eveByDate[it.date] = (eveByDate[it.date] ?? 0) + 1
    const parallel = Math.min(4, Math.max(1, Math.round(median(Object.values(eveByDate)))))
    // najczęstsze pory startu; dla każdej — najczęstszy koniec (lub +2h)
    const startFreq = new Map<string, number>()
    for (const it of eveItems) { const s = hm(it.start_time); startFreq.set(s, (startFreq.get(s) ?? 0) + 1) }
    const topStarts = [...startFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, parallel).map(e => e[0])
    topStarts.sort()
    eveSlots = topStarts.map(s => {
      const ends = eveItems.filter(i => hm(i.start_time) === s && i.end_time).map(i => hm(i.end_time!))
      return [s, (mode(ends) ?? addHours(s, 2))] as [string, string]
    })
    if (!eveSlots.length) eveSlots = fallback.eveSlots
  }

  // ── Poranki/popołudniówki (start < cutoff): odsetek dni + typowe pory ──────
  const matItems = all.filter(i => hm(i.start_time) < EVE_CUTOFF)
  const datesWithMat = (pred: (d: number) => boolean) =>
    new Set(matItems.filter(i => pred(dowOf(i.date))).map(i => i.date)).size
  const playedDates = (pred: (d: number) => boolean) =>
    new Set(all.filter(i => pred(dowOf(i.date))).map(i => i.date)).size
  const ratio = (num: number, den: number) => den > 0 ? Math.min(1, +(num / den).toFixed(3)) : 0

  const matSun = ratio(datesWithMat(d => d === 0), playedDates(d => d === 0))
  const matSat = ratio(datesWithMat(d => d === 6), playedDates(d => d === 6))
  const matWeekday = ratio(datesWithMat(d => d >= 1 && d <= 5), playedDates(d => d >= 1 && d <= 5))

  const matPairs = (pred: (d: number) => boolean): [string, string] => {
    const items = matItems.filter(i => pred(dowOf(i.date)))
    const s = mode(items.map(i => hm(i.start_time)))
    if (!s) return pred(0) || pred(6) ? fallback.matWeekendTime : fallback.matWeekdayTime
    const ends = items.filter(i => hm(i.start_time) === s && i.end_time).map(i => hm(i.end_time!))
    return [s, mode(ends) ?? addHours(s, 2)]
  }
  const matWeekendTime = matPairs(d => d === 0 || d === 6)
  const matWeekdayTime = matPairs(d => d >= 1 && d <= 5)

  const profile: Profile = {
    key: `${fallback.key}·learned`,
    eveningTarget, matSun, matSat, matWeekday,
    matWeekendTime, matWeekdayTime, eveSlots, dowW,
  }

  // ── Sezonowość: korelacja tytuł ↔ miesiąc roku ────────────────────────────
  // Pomijamy gości (production_id null) — to wynajmy, nie wybory repertuarowe.
  const titleMonth: Record<string, Record<number, number>> = {}
  const titleTotal: Record<string, number> = {}
  const monthTotal: Record<number, number> = {}
  let grand = 0
  for (const it of all) {
    if (!it.production_id || !it.production_title) continue
    const t = it.production_title, mo = monthOf(it.date)
    ;(titleMonth[t] ??= {})[mo] = (titleMonth[t][mo] ?? 0) + 1
    titleTotal[t] = (titleTotal[t] ?? 0) + 1
    monthTotal[mo] = (monthTotal[mo] ?? 0) + 1
    grand++
  }
  const seasonality: Seasonality = {
    affinity(title, monthIdx) {
      const tot = titleTotal[title]
      if (!tot || !grand) return 0
      const share = (titleMonth[title]?.[monthIdx] ?? 0) / tot          // udział grań tytułu w tym miesiącu
      const expected = (monthTotal[monthIdx] ?? 0) / grand              // udział całego repertuaru w tym miesiącu
      if (expected <= 0) return 0                                       // brak danych dla miesiąca → neutralnie
      const rel = (share - expected) / (expected + share + 1e-6)        // nadreprezentacja, znormalizowana
      return Math.max(-1, Math.min(1, +rel.toFixed(3)))
    },
  }

  return { profile, seasonality, basis, learned: true }
}
