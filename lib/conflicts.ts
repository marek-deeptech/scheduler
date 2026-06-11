// Shared conflict detection utility

export type ConflictReason = 'artist' | 'room' | 'tech_venue'

export interface NormalizedEvent {
  id: string
  start_time: string
  end_time: string
  room_id?: string | null
  theatre_id?: string | null
  artist_ids: string[]
}

export interface ConflictResult {
  aId: string
  bId: string
  reasons: ConflictReason[]
  sharedArtistIds: string[]
}

// Detect all 3 conflict types:
// 'artist'     – same person assigned to overlapping events
// 'room'       – same room double-booked at the same time
// 'tech_venue' – Technique team member in overlapping events at different theatres
export function findConflicts(
  events: NormalizedEvent[],
  techArtistIds: Set<string> = new Set()
): ConflictResult[] {
  const results: ConflictResult[] = []

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j]
      const overlap =
        new Date(a.start_time) < new Date(b.end_time) &&
        new Date(b.start_time) < new Date(a.end_time)
      if (!overlap) continue

      const reasons: ConflictReason[] = []
      const shared = a.artist_ids.filter(id => b.artist_ids.includes(id))

      if (shared.length > 0) {
        reasons.push('artist')
        if (
          a.theatre_id && b.theatre_id &&
          a.theatre_id !== b.theatre_id &&
          shared.some(id => techArtistIds.has(id))
        ) {
          reasons.push('tech_venue')
        }
      }

      if (a.room_id && b.room_id && a.room_id === b.room_id) {
        reasons.push('room')
      }

      if (reasons.length > 0) {
        results.push({ aId: a.id, bId: b.id, reasons, sharedArtistIds: shared })
      }
    }
  }

  return results
}

export function conflictingIdSet(results: ConflictResult[]): Set<string> {
  const ids = new Set<string>()
  for (const r of results) { ids.add(r.aId); ids.add(r.bId) }
  return ids
}

export const CONFLICT_LABEL: Record<ConflictReason, string> = {
  artist:     'Konflikt obsady',
  room:       'Podwójna rezerwacja sali',
  tech_venue: 'Technik w 2 teatrach',
}

export const CONFLICT_ICON: Record<ConflictReason, string> = {
  artist:     '⚠️',
  room:       '🏠',
  tech_venue: '🔀',
}

// ── Proposal-level conflict detection ─────────────────────────────────────────
// Detects cast conflicts in planning proposals: same artist in two productions
// scheduled on the same date with overlapping start/end times.

export interface ProposalConflict {
  date:        string
  productions: Array<{ title: string; room: string | null; start_time: string }>
  artistIds:   string[]
  artistNames: string[]
}

export function detectProposalConflicts(
  events: Array<{
    date:             string
    production_title: string
    room_name:        string | null
    start_time:       string
    end_time:         string
  }>,
  productionCast: Map<string, string[]>,   // production title → artist IDs
  artistNames:    Map<string, string>       // artist ID → display name
): ProposalConflict[] {
  const results: ProposalConflict[] = []

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      if (a.date !== b.date) continue
      if (a.production_title === b.production_title) continue
      // Time overlap (HH:MM string compare is safe for same-day events)
      if (a.start_time >= b.end_time || b.start_time >= a.end_time) continue

      const aCast  = productionCast.get(a.production_title) ?? []
      const bCast  = productionCast.get(b.production_title) ?? []
      const shared = aCast.filter(id => bCast.includes(id))
      if (shared.length === 0) continue

      results.push({
        date: a.date,
        productions: [
          { title: a.production_title, room: a.room_name, start_time: a.start_time },
          { title: b.production_title, room: b.room_name, start_time: b.start_time },
        ],
        artistIds:   shared,
        artistNames: shared.map(id => artistNames.get(id) ?? id),
      })
    }
  }

  return results
}

/** Titles of all productions that participate in at least one conflict */
export function conflictedTitles(conflicts: ProposalConflict[]): Set<string> {
  const s = new Set<string>()
  for (const c of conflicts) c.productions.forEach(p => s.add(p.title))
  return s
}

/** Artist IDs involved in conflicts for a given production title */
export function conflictArtistIds(
  conflicts:   ProposalConflict[],
  prodTitle:   string
): Set<string> {
  const s = new Set<string>()
  for (const c of conflicts) {
    if (c.productions.some(p => p.title === prodTitle)) {
      c.artistIds.forEach(id => s.add(id))
    }
  }
  return s
}
