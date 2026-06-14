-- Planowanie repertuaru slotami — Etap 1–2 (Favourites + dostępność aktorów).
-- Uruchom w Supabase SQL Editor.

-- Slot = ciągłe okno grania tytułu w danym miesiącu (montaż/demontaż scenografii raz).
CREATE TABLE IF NOT EXISTS repertoire_slots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month              TEXT NOT NULL,                 -- 'YYYY-MM'
  production_id      UUID REFERENCES productions(id) ON DELETE CASCADE,
  window_start       DATE NOT NULL,
  window_end         DATE NOT NULL,
  target_performances INT NOT NULL DEFAULT 4,       -- realna max liczba grań
  status             TEXT NOT NULL DEFAULT 'collecting', -- collecting | planned
  locked_dates       JSONB,                          -- zatwierdzone dni grań ['2026-03-06', ...]
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Zaproszenie do ankiety: jeden link tokenowy na aktora na slot.
CREATE TABLE IF NOT EXISTS slot_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID REFERENCES repertoire_slots(id) ON DELETE CASCADE,
  artist_id    UUID REFERENCES artists(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL,
  submitted_at TIMESTAMPTZ,
  UNIQUE (slot_id, artist_id)
);

-- Odpowiedzi aktora: mogę / nie mogę per data.
CREATE TABLE IF NOT EXISTS slot_availability (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id    UUID REFERENCES repertoire_slots(id) ON DELETE CASCADE,
  artist_id  UUID REFERENCES artists(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  available  BOOLEAN NOT NULL,
  UNIQUE (slot_id, artist_id, date)
);

CREATE INDEX IF NOT EXISTS idx_slots_month ON repertoire_slots (month);
CREATE INDEX IF NOT EXISTS idx_slot_invites_token ON slot_invites (token);
CREATE INDEX IF NOT EXISTS idx_slot_avail ON slot_availability (slot_id, date);

-- Dostęp przez klucz anon (model aplikacji — jak pozostałe tabele).
ALTER TABLE repertoire_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all ON repertoire_slots;
DROP POLICY IF EXISTS anon_all ON slot_invites;
DROP POLICY IF EXISTS anon_all ON slot_availability;

CREATE POLICY anon_all ON repertoire_slots  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON slot_invites      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON slot_availability FOR ALL USING (true) WITH CHECK (true);
