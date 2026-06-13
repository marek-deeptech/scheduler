-- Komunikacja koordynator–aktorzy: rejestr wszystkich wiadomości
-- Uruchom w Supabase SQL Editor.

ALTER TABLE actor_messages
  ADD COLUMN IF NOT EXISTS direction             TEXT NOT NULL DEFAULT 'to_actor',
  ADD COLUMN IF NOT EXISTS kind                  TEXT NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS related_event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_production_id UUID REFERENCES productions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at               TIMESTAMPTZ;

-- direction: 'to_actor' | 'to_coordinator'
-- kind: 'message' | 'confirmation_request' | 'repertoire_approved'
--       | 'event_change' | 'availability_change' | 'conflict_alert' | 'substitution'

-- Wiadomości do koordynatora mogą nie dotyczyć konkretnego artysty
ALTER TABLE actor_messages ALTER COLUMN artist_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_actor_messages_artist
  ON actor_messages (artist_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_actor_messages_direction
  ON actor_messages (direction, sent_at DESC);

-- Email koordynatora do alarmów (choroba / zmiana dostępności)
INSERT INTO app_settings (key, value)
VALUES ('coordinator_email', 'marek@veryniceworks.com')
ON CONFLICT (key) DO NOTHING;
