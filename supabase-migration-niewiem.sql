-- A9: trzecia odpowiedź aktora w ankiecie dostępności — „nie wiem".
-- NULL w slot_availability.available = „nie wiem" (nie liczy się ani jako mogę, ani jako nie mogę).
ALTER TABLE slot_availability ALTER COLUMN available DROP NOT NULL;
