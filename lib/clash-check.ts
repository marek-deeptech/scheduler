import { supabase } from '@/lib/supabase'

// Twarda kontrola podwójnego przypisania: aktor nie może być w dwóch
// wydarzeniach tego samego dnia o nakładającym się czasie. Porównanie w
// „zegarze ściennym" (HH:MM ze start_time.slice(11,16)) — spójnie z konwencją
// zapisu (events.start_time = wall-clock w UTC) i detectProposalConflicts.

export interface ActorClash {
  artistId: string
  artistName: string
  eventId: string
  eventTitle: string
  startHM: string
  endHM: string
}

export async function findActorClashes(opts: {
  date: string          // YYYY-MM-DD
  startHM: string       // HH:MM
  endHM: string         // HH:MM
  artistIds: string[]
  excludeEventId?: string | null
}): Promise<ActorClash[]> {
  const { date, startHM, endHM, artistIds, excludeEventId } = opts
  if (!artistIds.length) return []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(startHM) || !/^\d{2}:\d{2}/.test(endHM)) return []

  const { data: evs } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, production_id, event_artists(artist_id)')
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`)

  const overlapping = ((evs ?? []) as any[]).filter(e => {
    if (excludeEventId && e.id === excludeEventId) return false
    const s  = String(e.start_time).slice(11, 16)
    const en = String(e.end_time).slice(11, 16)
    return startHM < en && s < endHM   // nakładanie zegarowe (same-day)
  })
  if (overlapping.length === 0) return []

  // Obsada efektywna: jawna (event_artists) albo z produkcji (artist_productions)
  const needProd = [...new Set(overlapping
    .filter(e => !(e.event_artists?.length))
    .map(e => e.production_id)
    .filter(Boolean))] as string[]
  const prodCast = new Map<string, string[]>()
  if (needProd.length > 0) {
    const { data: aps } = await supabase
      .from('artist_productions').select('artist_id, production_id').in('production_id', needProd)
    for (const r of (aps ?? []) as any[]) {
      const arr = prodCast.get(r.production_id) ?? []
      arr.push(r.artist_id); prodCast.set(r.production_id, arr)
    }
  }

  const idSet = new Set(artistIds)
  const hits: { aid: string; e: any }[] = []
  const clashIds = new Set<string>()
  for (const e of overlapping) {
    const explicit: string[] = (e.event_artists ?? []).map((x: any) => x.artist_id)
    const cast = explicit.length ? explicit : (prodCast.get(e.production_id) ?? [])
    for (const aid of cast) if (idSet.has(aid)) { hits.push({ aid, e }); clashIds.add(aid) }
  }
  if (hits.length === 0) return []

  const { data: names } = await supabase.from('artists').select('id, name').in('id', [...clashIds])
  const nameById = new Map(((names ?? []) as any[]).map(a => [a.id, a.name]))
  return hits.map(({ aid, e }) => ({
    artistId: aid,
    artistName: nameById.get(aid) ?? '?',
    eventId: e.id,
    eventTitle: e.title ?? '?',
    startHM: String(e.start_time).slice(11, 16),
    endHM: String(e.end_time).slice(11, 16),
  }))
}

/** Zwięzły komunikat o kolizji (blokada zapisu). */
export function clashMessage(clashes: ActorClash[]): string {
  const byArtist = new Map<string, ActorClash[]>()
  for (const c of clashes) {
    const arr = byArtist.get(c.artistId) ?? []
    arr.push(c); byArtist.set(c.artistId, arr)
  }
  const parts = [...byArtist.values()].map(cs => {
    const evs = cs.map(c => `„${c.eventTitle}" ${c.startHM}–${c.endHM}`).join(', ')
    return `• ${cs[0].artistName} — już gra: ${evs}`
  })
  return `Konflikt obsady — nie można zapisać. Te osoby są już przypisane w tym czasie:\n${parts.join('\n')}`
}
