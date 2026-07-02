import type { SupabaseClient } from '@supabase/supabase-js'

export type MessageKind =
  | 'message'
  | 'confirmation_request'
  | 'repertoire_approved'
  | 'event_change'
  | 'availability_change'
  | 'conflict_alert'
  | 'substitution'

export interface MessageLogRow {
  artist_id: string | null
  type: 'email' | 'sms' | 'app'
  direction?: 'to_actor' | 'to_coordinator'
  kind?: MessageKind
  subject: string
  body: string
  related_event_id?: string | null
  related_production_id?: string | null
  sent_at?: string
}

/**
 * Zapisuje wysłane wiadomości do actor_messages.
 * Jeśli migracja supabase-migration-messages.sql nie została jeszcze
 * uruchomiona (brak nowych kolumn), zapisuje w starym formacie.
 */
export async function logMessages(supabase: SupabaseClient, rows: MessageLogRow[], orgId?: string | null) {
  if (rows.length === 0) return

  const org = orgId ? { org_id: orgId } : {}   // brak org → DEFAULT (do usunięcia w Etapie 2)
  const sentAt = new Date().toISOString()
  const full = rows.map(r => ({
    ...org,
    artist_id: r.artist_id,
    type: r.type,
    direction: r.direction ?? 'to_actor',
    kind: r.kind ?? 'message',
    subject: r.subject,
    body: r.body,
    related_event_id: r.related_event_id ?? null,
    related_production_id: r.related_production_id ?? null,
    sent_at: r.sent_at ?? sentAt,
  }))

  const { error } = await supabase.from('actor_messages').insert(full)
  if (!error) return

  // Stary schemat — bez nowych kolumn; wiersze bez artist_id pomijamy
  const legacy = rows
    .filter(r => r.artist_id)
    .map(r => ({
      ...org,
      artist_id: r.artist_id,
      type: r.type,
      subject: r.subject,
      body: r.body,
      sent_at: r.sent_at ?? sentAt,
    }))
  if (legacy.length > 0) {
    const { error: legacyError } = await supabase.from('actor_messages').insert(legacy)
    if (legacyError) console.error('actor_messages log error:', legacyError)
  } else {
    console.error('actor_messages log error:', error)
  }
}
