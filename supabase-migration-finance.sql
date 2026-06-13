-- Moduł FINANSE — parametry prognozy (planowanie repertuaru pod przychód).
-- Uruchom w Supabase SQL Editor. Po migracji odpal: node scripts/seed-finance.mjs

-- Pojemność sal
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- Parametry finansowe per produkcja (tytuł) — model uproszczony
ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS price_category      TEXT    DEFAULT 'standard', -- 'premium' | 'standard' | 'mala'
  ADD COLUMN IF NOT EXISTS price_normal        NUMERIC,                    -- cena normalna (zł)
  ADD COLUMN IF NOT EXISTS price_reduced       NUMERIC,                    -- ulgowy (zł)
  ADD COLUMN IF NOT EXISTS price_last_minute   NUMERIC,                    -- wejściówka (zł)
  ADD COLUMN IF NOT EXISTS assumed_attendance  NUMERIC DEFAULT 0.75,       -- zakładana frekwencja 0–1
  ADD COLUMN IF NOT EXISTS fixed_cost          NUMERIC DEFAULT 8000;       -- ryczałt kosztu / spektakl (zł)

-- Globalne parametry finansowe w app_settings
INSERT INTO app_settings (key, value) VALUES
  ('finance_ticket_mix',      '{"normal":0.7,"reduced":0.2,"last_minute":0.1}'),
  ('finance_weekend_uplift',  '0.10'),
  ('finance_vat_rate',        '0.08'),
  ('finance_default_attendance', '0.75'),
  ('finance_default_fixed_cost', '8000')
ON CONFLICT (key) DO NOTHING;
