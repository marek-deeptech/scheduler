// Obrazek „print screen" z konkretnymi datami okna grania — załącznik do ankiety
// dostępności, żeby aktor widział proponowane dni bez otwierania formularza.
//
// Rysujemy SVG i konwertujemy do PNG przez sharp (jest w zależnościach Next.js).
// Gdyby konwersja zawiodła (np. brak fontów w runtime), wracamy do SVG — mail
// wychodzi w obu przypadkach, bo daty są też wypisane w treści wiadomości.

import { windowDates } from './slots'

const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']
const MON_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface WindowImage { filename: string; content: Buffer; contentType: string }

/** Buduje SVG kalendarza okna grania (dni jako kafelki, weekendy wyróżnione). */
export function buildWindowSvg(opts: {
  title: string
  windowStart: string
  windowEnd: string
  target: number
}): string {
  const dates = windowDates(opts.windowStart, opts.windowEnd)
  const PER_ROW = 7
  const CELL_W = 104, CELL_H = 76, GAP = 10, PAD = 28
  const rows = Math.ceil(dates.length / PER_ROW)
  const cols = Math.min(PER_ROW, dates.length)
  const gridW = cols * CELL_W + (cols - 1) * GAP
  const width = Math.max(560, gridW + PAD * 2)
  const headerH = 132
  const height = headerH + rows * CELL_H + (rows - 1) * GAP + PAD

  const cells = dates.map((d, i) => {
    const dt = new Date(d + 'T12:00:00')
    const dow = dt.getDay()
    const weekend = dow === 0 || dow === 6
    const x = PAD + (i % PER_ROW) * (CELL_W + GAP)
    const y = headerH + Math.floor(i / PER_ROW) * (CELL_H + GAP)
    return `
      <g>
        <rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="10"
              fill="${weekend ? '#fdf2f4' : '#ffffff'}" stroke="${weekend ? '#f0c8d0' : '#e4ddd4'}" stroke-width="1.5"/>
        <text x="${x + CELL_W / 2}" y="${y + 24}" text-anchor="middle"
              font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="13"
              fill="${weekend ? '#c8102e' : '#a89e92'}">${DAY_SHORT[dow]}</text>
        <text x="${x + CELL_W / 2}" y="${y + 52}" text-anchor="middle"
              font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="26" font-weight="bold"
              fill="#1a1410">${dt.getDate()}</text>
        <text x="${x + CELL_W / 2}" y="${y + 68}" text-anchor="middle"
              font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="11"
              fill="#a89e92">${MON_SHORT[dt.getMonth()]}</text>
      </g>`
  }).join('')

  const rangeLabel = `${fmtLong(opts.windowStart)} – ${fmtLong(opts.windowEnd)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#faf6f0"/>
  <text x="${PAD}" y="46" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="24" font-weight="bold" fill="#1a1410">${esc(opts.title)}</text>
  <text x="${PAD}" y="76" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="15" fill="#7a7068">Okno grania: ${esc(rangeLabel)}</text>
  <text x="${PAD}" y="102" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="15" fill="#c8102e">Szukamy ${opts.target} ${dniLabel(opts.target)} — zaznacz, kiedy możesz zagrać</text>
  ${cells}
</svg>`
}

function fmtLong(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })
}

function dniLabel(n: number): string {
  if (n === 1) return 'dnia'
  return 'dni'
}

/** SVG → PNG (sharp). Zwraca załącznik gotowy dla sendEmail; przy błędzie — SVG. */
export async function buildWindowImage(opts: {
  title: string
  windowStart: string
  windowEnd: string
  target: number
}): Promise<WindowImage | null> {
  let svg: string
  try {
    svg = buildWindowSvg(opts)
  } catch {
    return null
  }
  const safeName = (opts.title || 'spektakl').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'spektakl'
  try {
    const sharp = (await import('sharp')).default
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return { filename: `terminy-${safeName}.png`, content: png, contentType: 'image/png' }
  } catch {
    // Fallback: SVG też jest podglądalny; ważne, by mail wyszedł.
    return { filename: `terminy-${safeName}.svg`, content: Buffer.from(svg), contentType: 'image/svg+xml' }
  }
}
