-- ─────────────────────────────────────────────────────────────────────────────
-- Kategoria CORE dla aktorów (kluczowi aktorzy uwzględniani w generowaniu).
-- Uruchom RĘCZNIE w Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table artists add column if not exists is_core boolean not null default false;
