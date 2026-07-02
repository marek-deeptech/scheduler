-- Multi-tenancy Etap 2 — uogólnienie scen (3 sceny dla TD)
-- Zdejmujemy sztywny CHECK ('duza','mala') z productions.stage.
-- Klucz sceny jest teraz per teatr (2 sceny Fundacji lub 3 sceny TD),
-- a dozwolone wartości waliduje aplikacja przez rejestr THEATRE_SCENES (lib/finance.ts).
-- Kolumna pozostaje text NOT NULL DEFAULT 'duza'.

ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_stage_check;
