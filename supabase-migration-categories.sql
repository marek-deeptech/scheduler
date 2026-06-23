-- Kategorie tytułów z 3 poziomami (1/2/3), ustawiane przez koordynatora:
--   • Favourite   — najważniejsze, prestiżowe tytuły (serduszko ♥)
--   • Hit Kasowy  — najbardziej dochodowe tytuły (dolar $)
-- Poziom 0 = brak kategorii. Kolumna is_favourite zostaje (= favourite_level > 0)
-- dla zgodności z planowaniem/finansami i jest synchronizowana przy zapisie.

ALTER TABLE productions ADD COLUMN IF NOT EXISTS favourite_level int NOT NULL DEFAULT 0;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS hit_level       int NOT NULL DEFAULT 0;

-- Backfill: dotychczasowe Favourites dostają poziom 1.
UPDATE productions SET favourite_level = 1 WHERE is_favourite = true AND favourite_level = 0;

ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_fav_level_check;
ALTER TABLE productions ADD CONSTRAINT productions_fav_level_check CHECK (favourite_level BETWEEN 0 AND 3);
ALTER TABLE productions DROP CONSTRAINT IF EXISTS productions_hit_level_check;
ALTER TABLE productions ADD CONSTRAINT productions_hit_level_check CHECK (hit_level BETWEEN 0 AND 3);
