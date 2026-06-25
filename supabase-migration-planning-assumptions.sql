-- ─────────────────────────────────────────────────────────────────────────────
-- Założenia dodatkowe do planowania — zapisywane OSOBNO dla każdego teatru.
-- Przykład: „Pani Janda nie gra spektakli 24 grudnia".
-- Uruchom RĘCZNIE w Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists planning_assumptions (
  id         uuid primary key default gen_random_uuid(),
  theatre_id uuid not null,
  text       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists planning_assumptions_theatre_idx on planning_assumptions(theatre_id);

-- Spójnie z resztą tabel apki (klucz anon, brak realnego auth) — bez RLS.
-- Supabase domyślnie włącza RLS na nowych tabelach, więc jawnie je wyłączamy.
alter table planning_assumptions disable row level security;
