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
