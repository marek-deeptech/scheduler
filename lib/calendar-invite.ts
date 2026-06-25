import { buildIcs, type Vevent } from './ics'

const DOMAIN = 'repertuar.vercel.app'

export const INVITE_ORGANIZER = { name: 'Koordynacja Teatru', email: 'koordynacja@veryniceworks.com' }

export function inviteUid(eventId: string, artistId: string): string {
  return `${eventId}.${artistId}@${DOMAIN}`
}

type Pair = { event_id: string; artist_id: string }

/**
 * Pobiera i zwiększa SEQUENCE dla par (event, aktor) — upsert do calendar_invites.
 * cancel=true ustawia status 'cancelled'. Zwraca mapę `${event}:${artist}` → {uid, sequence}.
 */
export async function bumpInviteSeqs(
  supabase: any,
  pairs: Pair[],
  cancel = false,
): Promise<Map<string, { uid: string; sequence: number }>> {
  const out = new Map<string, { uid: string; sequence: number }>()
  if (!pairs.length) return out

  const eventIds  = [...new Set(pairs.map(p => p.event_id))]
  const artistIds = [...new Set(pairs.map(p => p.artist_id))]
  const { data: existing } = await supabase
    .from('calendar_invites')
    .select('event_id, artist_id, sequence')
    .in('event_id', eventIds)
    .in('artist_id', artistIds)

  const prev = new Map<string, number>((existing ?? []).map((r: any) => [`${r.event_id}:${r.artist_id}`, r.sequence]))
  const now = new Date().toISOString()

  const rows = pairs.map(p => {
    const key = `${p.event_id}:${p.artist_id}`
    const had = prev.get(key)
    const sequence = had === undefined ? (cancel ? 1 : 0) : had + 1
    const uid = inviteUid(p.event_id, p.artist_id)
    out.set(key, { uid, sequence })
    return { event_id: p.event_id, artist_id: p.artist_id, uid, sequence, status: cancel ? 'cancelled' : 'confirmed', updated_at: now }
  })

  await supabase.from('calendar_invites').upsert(rows, { onConflict: 'event_id,artist_id' })
  return out
}

/** Buduje załącznik .ics (format Resend) dla jednego odbiorcy. */
export function inviteAttachment(
  method: 'REQUEST' | 'CANCEL',
  attendee: { name: string; email: string },
  events: Vevent[],
) {
  const ics = buildIcs({ method, organizer: INVITE_ORGANIZER, attendee, events })
  return {
    filename: method === 'CANCEL' ? 'odwolanie.ics' : 'zaproszenie.ics',
    content: Buffer.from(ics, 'utf-8'),
    contentType: `text/calendar; method=${method}; charset=UTF-8`,
  }
}
