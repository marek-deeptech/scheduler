import { createClient } from '@supabase/supabase-js'
import { sessionOrgId } from '@/lib/session-org'
import { scenesForTheatre, mapRoomsToScenes } from '@/lib/finance'
import { EVENT_TYPES } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function norm(s: unknown): string {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim()
}

const EVENT_TYPE_BY_NORM = new Map(EVENT_TYPES.map(t => [norm(t), t]))

/** „Spektakl" / „Próba" / konkretny typ → kanoniczny typ wydarzenia. */
function canonicalType(raw: unknown): string {
  const n = norm(raw)
  if (!n) return 'Spektakl'
  const exact = EVENT_TYPE_BY_NORM.get(n)
  if (exact) return exact
  if (n.includes('prob') || n.includes('prób')) return 'Próba sytuacyjna'
  if (n.includes('spekt') || n.includes('przedstaw')) return 'Spektakl'
  return 'Spektakl'
}

interface Row { date: string; start?: string; end?: string; title: string; type?: string; scene?: string }

const HHMM = (t: unknown): string | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? '').toString().trim())
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}:00`
}

export async function POST(request: Request) {
  const orgId = await sessionOrgId(request)
  if (!orgId) return Response.json({ error: 'Brak sesji organizacji' }, { status: 401 })

  const { month, theatreId, label, rows } = await request.json() as {
    month: string; theatreId: string | null; label?: string; rows: Row[]
  }
  if (!/^\d{4}-\d{2}$/.test(month ?? '')) return Response.json({ error: 'Nieprawidłowy miesiąc' }, { status: 400 })
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: 'Brak wierszy do importu' }, { status: 400 })

  // Walidacja: teatr musi należeć do org (jeśli podany)
  if (theatreId) {
    const { data: th } = await supabase.from('theatres').select('id').eq('org_id', orgId).eq('id', theatreId).maybeSingle()
    if (!th) return Response.json({ error: 'Teatr spoza organizacji' }, { status: 403 })
  }

  // Tytuły → production_id (org)
  const { data: prods } = await supabase.from('productions').select('id, title, theatre_id').eq('org_id', orgId)
  const prodByNorm = new Map<string, { id: string; title: string }>()
  for (const p of (prods ?? []) as any[]) prodByNorm.set(norm(p.title), { id: p.id, title: p.title })

  // Sceny teatru → sala
  const scenes = scenesForTheatre(theatreId)
  const { data: rooms } = await supabase.from('rooms').select('id, name').eq('org_id', orgId)
  const sceneToRoom = mapRoomsToScenes(scenes, (rooms ?? []) as any[])
  const roomNameById = new Map<string, string>()
  for (const r of (rooms ?? []) as any[]) roomNameById.set(r.id, r.name ?? '')
  const matchScene = (raw: unknown) => {
    const n = norm(raw)
    if (!n) return scenes[0]
    return scenes.find(s => norm(s.label) === n)
        ?? scenes.find(s => n.includes(norm(s.label)) || norm(s.label).includes(n))
        ?? scenes.find(s => s.key === n)
        ?? scenes[0]
  }

  const proposalData: any[] = []
  const unmatchedTitles = new Set<string>()
  let skipped = 0

  for (const r of rows) {
    const date = (r.date ?? '').toString().trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(month)) { skipped++; continue }
    const title = (r.title ?? '').toString().trim()
    if (!title) { skipped++; continue }
    const start = HHMM(r.start) ?? '19:00:00'
    const end   = HHMM(r.end)   ?? '21:00:00'
    const type  = canonicalType(r.type)
    const scene = matchScene(r.scene)
    const roomId = sceneToRoom[scene.key] ?? null
    const prod = prodByNorm.get(norm(title))
    if (!prod) unmatchedTitles.add(title)
    proposalData.push({
      date,
      production_id: prod?.id ?? null,
      production_title: prod?.title ?? title,
      room_id: roomId,
      room_name: roomId ? (roomNameById.get(roomId) || scene.label) : scene.label,
      start_time: start,
      end_time: end,
      type,
    })
  }

  if (proposalData.length === 0) {
    return Response.json({ error: 'Żaden wiersz nie pasuje do wybranego miesiąca.' }, { status: 400 })
  }

  proposalData.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  const byProd: Record<string, number> = {}
  for (const e of proposalData) byProd[e.production_title] = (byProd[e.production_title] ?? 0) + 1

  const { data: inserted, error } = await supabase.from('repertoire_proposals').insert({
    org_id: orgId,
    theatre_id: theatreId ?? null,
    month,
    label: label?.trim() || 'Import Excel',
    status: 'draft',
    reasoning: 'Roboczy rozkład zaimportowany z pliku Excel (KPA).',
    proposal_data: proposalData,
    stats: { total: proposalData.length, conflicts: 0, by_production: byProd },
  }).select('id').single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    ok: true,
    proposalId: inserted?.id,
    rowsImported: proposalData.length,
    skipped,
    unmatchedTitles: [...unmatchedTitles],
  })
}
