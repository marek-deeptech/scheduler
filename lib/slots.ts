// Logika slotów Favourites — Etap 1–2 planowania repertuaru.

export interface SlotRow {
  id: string
  month: string
  production_id: string
  window_start: string   // 'YYYY-MM-DD'
  window_end: string
  target_performances: number
  status: 'collecting' | 'planned'
  locked_dates: string[] | null
}

/** Lista dat (YYYY-MM-DD) od window_start do window_end włącznie. */
export function windowDates(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(start + 'T12:00:00')
  const last = new Date(end + 'T12:00:00')
  while (d <= last) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

export type DayFeasibility = 'full' | 'warn' | 'blocked'

export interface DayCoverage {
  date: string
  availableCount: number
  missingCount: number       // ilu z obsady niedostępnych (lub bez odpowiedzi)
  feasibility: DayFeasibility // full = pełna obsada, warn = 1 brak, blocked = 2+
  missingNames: string[]
}

/**
 * Pokrycie obsady dla każdego dnia okna.
 * availability: artistId -> (date -> available). Brak wpisu = brak odpowiedzi = niedostępny.
 * Dopuszczamy 1 brak (warn); 2+ braków = blocked.
 */
export function dayCoverage(
  dates: string[],
  castIds: string[],
  availability: Record<string, Record<string, boolean>>,
  artistName: (id: string) => string,
): DayCoverage[] {
  return dates.map(date => {
    const missing: string[] = []
    let available = 0
    for (const aid of castIds) {
      const ans = availability[aid]?.[date]
      if (ans === true) available++
      else missing.push(artistName(aid))
    }
    const missingCount = castIds.length - available
    const feasibility: DayFeasibility =
      missingCount === 0 ? 'full' : missingCount === 1 ? 'warn' : 'blocked'
    return { date, availableCount: available, missingCount, feasibility, missingNames: missing }
  })
}

/**
 * Auto-sugestia dni grań: wybierz N dni z najlepszym pokryciem obsady.
 * Dopuszczamy dni z 1 brakiem (warn), ale preferujemy pełną obsadę (full).
 * Zwraca posortowane daty (chronologicznie).
 */
export function suggestDays(coverage: DayCoverage[], target: number): string[] {
  const eligible = coverage.filter(c => c.feasibility !== 'blocked')
  const ranked = [...eligible].sort((a, b) =>
    a.missingCount - b.missingCount ||         // pełna obsada najpierw
    b.availableCount - a.availableCount ||      // potem największe pokrycie
    a.date.localeCompare(b.date),               // potem chronologicznie
  )
  return ranked.slice(0, target).map(c => c.date).sort((a, b) => a.localeCompare(b))
}

export function fmtDayShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}
