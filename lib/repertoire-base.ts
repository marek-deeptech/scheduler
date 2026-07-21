// ── BAZOWY WZORZEC REPERTUARU ────────────────────────────────────────────────
// Wspólny „kształt" repertuaru wyprowadzony z analizy realnych repertuarów
// Teatru Polonia i Och-Teatru (IV 2025 – X 2026, 1437 spektakli). Definiuje
// KIEDY i ILE spektakli grać (sloty: dni × pora), niezależnie od tego, JAKIE
// tytuły je wypełnią. Ścieżka bez finansów wypełnia sloty rotacją/blokami,
// ścieżka finansowa — wg celu finansowego. Finanse/założenia/Favourites
// modyfikują dopiero ten bazowy kształt.

export interface Profile {
  key:            string
  eveningTarget:  number              // ile DNI grania (reszta = ciemne)
  matSun:         number              // odsetek niedziel z dodatkowym porankiem
  matSat:         number              // odsetek sobót z porankiem
  matWeekday:     number              // odsetek dni roboczych z porankiem (Och: 12:00 szkolne)
  matWeekendTime: [string, string]
  matWeekdayTime: [string, string]
  // Sloty WIECZORNE emitowane na każdy dzień grania. Teatry jednoscenowe
  // (Polonia/Och) mają 1; TD (4 sceny) gra kilka wieczorów RÓWNOLEGLE na różnych
  // scenach — kolejne sloty mają przesunięte godziny (19:00/19:30/18:00), by były
  // odrębne i by generator obsadził je różnymi tytułami na różnych scenach.
  eveSlots:       Array<[string, string]>
  // Waga dni tygodnia (0=Ndz … 6=Sob) wyuczona z historii teatru; gdy brak — globalna DOW_W.
  dowW?:          Record<number, number>
}

export function profileFor(name: string): Profile {
  const n = (name || '').toLowerCase()
  if (n.includes('och'))
    return { key: 'Och', eveningTarget: 28, matSun: 0.50, matSat: 0.45, matWeekday: 0.14,
             matWeekendTime: ['16:00:00', '18:00:00'], matWeekdayTime: ['12:00:00', '14:00:00'],
             eveSlots: [['19:00:00', '21:30:00']] }
  // Teatr Dramatyczny im. G. Holoubka — teatr państwowy, 4 sceny grające RÓWNOLEGLE.
  // Profil wyprowadzony z realnego repertuaru TD (teatrdramatyczny.pl, VII+IX 2026):
  //  • ~1,6 spektaklu/dzień grania w próbce letniej → w pełnym sezonie 2 sceny/wieczór
  //    (eveSlots ×2: 19:00 i 19:30 — obie pory dominują w danych),
  //  • wieczór 19:00/19:30; weekendowe wczesne 17:00–19:00; szkolne poranki 11:00 w tygodniu,
  //  • poniedziałek najlżejszy/ciemny, weekend cięższy (ndz≈sob),
  //  • bloki 2-dniowe (13/18 przebiegów w danych), tytuł ~2× w oknie — jak Polonia/Och.
  if (n.includes('dramatyczny'))
    return { key: 'TD', eveningTarget: 26, matSun: 0.55, matSat: 0.45, matWeekday: 0.15,
             matWeekendTime: ['17:00:00', '19:00:00'], matWeekdayTime: ['11:00:00', '13:00:00'],
             eveSlots: [['19:00:00', '21:00:00'], ['19:30:00', '21:30:00']] }
  // Domyślnie profil typu „Polonia" (jedna duża scena, mniej poranków)
  return { key: 'Polonia', eveningTarget: 26, matSun: 0.45, matSat: 0.20, matWeekday: 0,
           matWeekendTime: ['16:00:00', '18:00:00'], matWeekdayTime: ['12:00:00', '14:00:00'],
           eveSlots: [['19:00:00', '21:30:00']] }
}

// Waga dnia tygodnia (0=Ndz … 6=Sob): pn najlżej, ndz najciężej — z rozkładu realnego.
export const DOW_W: Record<number, number> = { 0: 1.05, 1: 0.78, 2: 0.92, 3: 0.92, 4: 0.90, 5: 0.95, 6: 1.0 }

export interface Variant { label: string; dEve: number; matMul: number; block: number; hint: string }
export const VARIANTS: Variant[] = [
  { label: 'Propozycja 1', dEve:  0, matMul: 1.0, block: 2, hint: 'bazowy wzorzec — realny rytm grania' },
  { label: 'Propozycja 2', dEve: -2, matMul: 0.6, block: 2, hint: 'lżejszy miesiąc' },
  { label: 'Propozycja 3', dEve: +1, matMul: 1.4, block: 2, hint: 'gęstszy — więcej weekendowych poranków' },
  { label: 'Propozycja 4', dEve:  0, matMul: 1.0, block: 1, hint: 'większa różnorodność tytułów' },
]
// Wariant bazowy (kształt) używany przez ścieżkę finansową — cele różnicują tylko dobór tytułów.
export const BASE_VARIANT: Variant = VARIANTS[0]

export function getDaysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count  = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

export function prevDate(date: string): string {
  const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Dni robocze (pn–pt) ŚCIŚLE między a i b (a < b). Do liczenia montażu/demontażu.
export function workingDaysBetween(a: string, b: string): number {
  let n = 0
  const d = new Date(a + 'T12:00:00'); d.setDate(d.getDate() + 1)
  const end = new Date(b + 'T12:00:00')
  while (d < end) { const w = d.getDay(); if (w >= 1 && w <= 5) n++; d.setDate(d.getDate() + 1) }
  return n
}

// Czy tytuł B może wejść na scenę w dniu D po tytule A (stan sceny): musi minąć
// tyle dni roboczych, ile trwa demontaż A + montaż B. Gdy brak poprzednika — OK.
export function changeoverOk(
  last: { date: string; teardown: number } | undefined,
  date: string,
  setupOfNext: number,
): boolean {
  if (!last) return true
  return workingDaysBetween(last.date, date) >= (last.teardown + setupOfNext)
}

// Wybierz k elementów równomiernie rozłożonych po liście (deterministycznie).
export function pickEvenly(arr: string[], k: number): Set<string> {
  if (k <= 0) return new Set()
  if (k >= arr.length) return new Set(arr)
  const out = new Set<string>(); const step = arr.length / k
  for (let i = 0; i < k; i++) out.add(arr[Math.floor(i * step + step / 2)])
  return out
}

export interface Slot { date: string; dow: number; start: string; end: string; kind: 'eve' | 'mat' }

// Empiryczny kształt: które dni grają i z iloma spektaklami (poranek + wieczór).
export function buildSlots(variant: Variant, month: string, profile: Profile): Slot[] {
  const days = getDaysInMonth(month).map(d => ({ date: d, dow: new Date(d + 'T12:00:00').getDay() }))
  const eveningTarget = Math.max(1, profile.eveningTarget + variant.dEve)

  // Dni ciemne: tyle dni o najniższej wadze, by zostało ~eveningTarget dni grania.
  // Jitter wg kolejności wystąpienia dnia tygodnia rozkłada ciemne dni (nie zeruje
  // całego dnia tygodnia) — poniedziałki wypadają najczęściej, ale nie wszystkie.
  const darkCount = Math.max(0, days.length - eveningTarget)
  const dw = profile.dowW ?? DOW_W   // wagi dni: wyuczone z historii teatru lub globalne
  const occ: Record<number, number> = {}
  const scored = days.map(d => {
    occ[d.dow] = (occ[d.dow] || 0) + 1
    return { date: d.date, s: (dw[d.dow] ?? 0.9) + (occ[d.dow] - 1) * 0.5 }
  })
  scored.sort((a, b) => a.s - b.s || a.date.localeCompare(b.date))
  const dark = new Set(scored.slice(0, darkCount).map(d => d.date))

  // Poranki/popołudnia (dni z 2 spektaklami): weekend (ndz > sob) + Och w tygodniu.
  const sundays   = days.filter(d => d.dow === 0 && !dark.has(d.date)).map(d => d.date)
  const saturdays = days.filter(d => d.dow === 6 && !dark.has(d.date)).map(d => d.date)
  const weekdays  = days.filter(d => d.dow >= 1 && d.dow <= 5 && !dark.has(d.date)).map(d => d.date)
  const matDays = new Map<string, [string, string]>()
  for (const d of pickEvenly(sundays,   Math.round(sundays.length   * profile.matSun     * variant.matMul))) matDays.set(d, profile.matWeekendTime)
  for (const d of pickEvenly(saturdays, Math.round(saturdays.length * profile.matSat     * variant.matMul))) matDays.set(d, profile.matWeekendTime)
  if (profile.matWeekday > 0)
    for (const d of pickEvenly(weekdays, Math.round(weekdays.length  * profile.matWeekday * variant.matMul)))
      if (!matDays.has(d)) matDays.set(d, profile.matWeekdayTime)

  const slots: Slot[] = []
  for (const d of days) {
    if (dark.has(d.date)) continue
    const mt = matDays.get(d.date)
    if (mt) slots.push({ date: d.date, dow: d.dow, start: mt[0], end: mt[1], kind: 'mat' })
    // Wieczory: 1 (Polonia/Och) lub kilka RÓWNOLEGŁYCH scen (TD) — po jednym slocie
    // na scenę, z przesuniętymi godzinami (odrębne date|start w generatorze).
    for (const [s, e] of profile.eveSlots) slots.push({ date: d.date, dow: d.dow, start: s, end: e, kind: 'eve' })
  }
  return slots
}
