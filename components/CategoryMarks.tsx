/**
 * Oznaczenia kategorii tytułu: Favourite (♥, prestiż) i Hit Kasowy ($, dochód).
 * Każda ma poziom 1–3 (0 = brak). Symbol w jednym stylu, poziom jako mała liczba.
 */

const FAV_COLOR = '#ef4444'   // czerwień jak serduszko
const HIT_COLOR = '#15803d'   // zieleń „pieniędzy" dla Hitu

function HeartIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  )
}

function DollarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.7 7 6.8c0 5 10 2.6 10 7.7 0 2.1-2.2 3.3-5 3.3s-5-1.1-5-3.2" />
    </svg>
  )
}

// Poziom = liczba symboli (♥♥♥ / $$). Symbole małe i ciasno, by zmieściły się 3.
function Mark({ kind, level, size, title }: { kind: 'fav' | 'hit'; level: number; size: number; title: string }) {
  const color = kind === 'fav' ? FAV_COLOR : HIT_COLOR
  const n = Math.max(0, Math.min(3, level))
  return (
    <span className="inline-flex items-center shrink-0" title={`${title} — poziom ${n}`}>
      {Array.from({ length: n }).map((_, i) => (
        kind === 'fav' ? <HeartIcon key={i} size={size} color={color} /> : <DollarIcon key={i} size={size} color={color} />
      ))}
    </span>
  )
}

export function CategoryMarks({ favLevel = 0, hitLevel = 0, size = 12, className = '' }: {
  favLevel?: number
  hitLevel?: number
  size?: number
  className?: string
}) {
  if (favLevel <= 0 && hitLevel <= 0) return null
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {favLevel > 0 && <Mark kind="fav" level={favLevel} size={size} title="Favourite" />}
      {hitLevel > 0 && <Mark kind="hit" level={hitLevel} size={size} title="Hit Kasowy" />}
    </span>
  )
}

export { FAV_COLOR, HIT_COLOR }
