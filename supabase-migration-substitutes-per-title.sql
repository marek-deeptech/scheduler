-- ─────────────────────────────────────────────────────────────────────────────
-- Dublerzy PER TYTUŁ
-- Zmiana modelu: zamiast jednej płaskiej listy zastępców per aktor
-- (actor_substitutes), każdy aktor ma osobnych dublerów dla KAŻDEGO tytułu.
-- Uruchom RĘCZNIE w Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists actor_production_substitutes (
  id            uuid default gen_random_uuid() primary key,
  actor_id      uuid not null references artists(id)     on delete cascade,
  production_id uuid not null references productions(id)  on delete cascade,
  substitute_id uuid not null references artists(id)     on delete cascade,
  created_at    timestamptz default now(),
  unique (actor_id, production_id, substitute_id)
);

create index if not exists aps_actor_idx on actor_production_substitutes(actor_id);
create index if not exists aps_prod_idx  on actor_production_substitutes(production_id);

-- RLS deny-by-default (service_role omija; klient łączy się przez proxy).
-- Spójne z supabase-migration-rls.sql — brak polityk publicznych.
alter table actor_production_substitutes enable row level security;

-- Seed punktu startowego z dotychczasowej płaskiej listy (jeśli istnieje):
-- każdemu tytułowi aktora przypisujemy jego dotychczasowych zastępców, żeby nie
-- gubić danych. Koordynator może je potem zróżnicować per tytuł.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'actor_substitutes') then
    insert into actor_production_substitutes (actor_id, production_id, substitute_id)
    select s.actor_id, ap.production_id, s.substitute_id
    from actor_substitutes s
    join artist_productions ap on ap.artist_id = s.actor_id
    on conflict do nothing;
  end if;
end $$;
