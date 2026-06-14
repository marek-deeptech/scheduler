-- Repertuar planowany osobno dla każdego teatru.
-- Uruchom w Supabase SQL Editor.

ALTER TABLE repertoire_proposals
  ADD COLUMN IF NOT EXISTS theatre_id UUID REFERENCES theatres(id);

CREATE INDEX IF NOT EXISTS idx_proposals_month_theatre
  ON repertoire_proposals (month, theatre_id);
