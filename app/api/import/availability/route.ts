import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_STATUSES = new Set([
  'Dostępny', 'Dostępny tylko w Warszawie', 'Niepewny', 'Niedostępny', 'Urlop', 'Choroba',
])

function norm(s: unknown): string {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim()
}
const tokenKey = (s: unknown) => norm(s).split(' ').filter(Boolean).sort().join(' ')

interface Entry { actor: string; date: string; status: string; note?: string | null }

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const { entries } = await request.json() as { entries: Entry[] }
  if (!Array.isArray(entries) || entries.length === 0) {
    return Response.json({ error: 'Brak danych do importu' }, { status: 400 })
  }

  // Słownik aktorów (org) — dopasowanie po nazwie: dokładne, potem zbiór tokenów.
  const { data: arts } = await supabase.from('artists').select('id, name').eq('org_id', orgId)
  const byExact = new Map<string, string>()
  const byTokens = new Map<string, string>()
  for (const a of (arts ?? []) as any[]) {
    byExact.set(norm(a.name), a.id)
    byTokens.set(tokenKey(a.name), a.id)
  }
  const matchActor = (name: string): string | null =>
    byExact.get(norm(name)) ?? byTokens.get(tokenKey(name)) ?? null

  // Grupuj po aktorze → { date: {status, note} }
  const byArtist = new Map<string, Map<string, { status: string; note: string | null }>>()
  const unmatched = new Set<string>()
  const invalid = new Set<string>()
  let skipped = 0

  for (const e of entries) {
    const status = (e.status ?? '').toString().trim()
    if (!VALID_STATUSES.has(status)) { if (status) invalid.add(status); skipped++; continue }
    if (!/^\d{4}-\d{2}-\d{2}$/.test((e.date ?? '').toString())) { skipped++; continue }
    const aid = matchActor(e.actor)
    if (!aid) { unmatched.add((e.actor ?? '').toString()); skipped++; continue }
    if (!byArtist.has(aid)) byArtist.set(aid, new Map())
    byArtist.get(aid)!.set(e.date, { status, note: e.note ?? null })
  }

  // Zapis: dla każdego aktora usuń istniejące wpisy z importowanych dat, wstaw nowe.
  // (spójnie z kalendarzem aktora — brak unikalnego indeksu (artist,date))
  let written = 0
  const insertRows: { org_id: string; artist_id: string; date: string; status: string; note: string | null }[] = []
  for (const [aid, dayMap] of byArtist) {
    const dates = [...dayMap.keys()]
    const { error: delErr } = await supabase.from('actor_day_status')
      .delete().eq('org_id', orgId).eq('artist_id', aid).in('date', dates)
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 })
    for (const [date, v] of dayMap) {
      insertRows.push({ org_id: orgId, artist_id: aid, date, status: v.status, note: v.note })
    }
  }
  if (insertRows.length > 0) {
    const { error: insErr } = await supabase.from('actor_day_status').insert(insertRows)
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
    written = insertRows.length
  }

  return Response.json({
    ok: true,
    actorsMatched: byArtist.size,
    entriesWritten: written,
    skipped,
    unmatchedActors: [...unmatched],
    invalidStatuses: [...invalid],
  })
}
