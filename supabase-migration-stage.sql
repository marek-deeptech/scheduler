-- Scena tytułu (Mała/Duża) — twardy atrybut, niezależny od kategorii cenowej.
-- Tytuł gra na jednej scenie (unikalna scenografia): scena steruje pojemnością
-- widowni i sugerowanym kosztem ryczałtowym.

ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'duza';

-- Backfill z dotychczasowego źródła sceny: kategoria cenowa 'mala' = Mała Scena.
UPDATE productions SET stage = 'mala' WHERE price_category = 'mala';

-- Dozwolone wartości.
ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_stage_check;
ALTER TABLE productions ADD CONSTRAINT productions_stage_check CHECK (stage IN ('duza', 'mala'));
