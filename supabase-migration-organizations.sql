-- ─────────────────────────────────────────────────────────────────────────────
-- MULTI-TENANCY (Etap 1) — organizacje (najemcy).
-- Organizacja = najemca POZIOM WYŻEJ niż teatr. Fundacja KJ ma 2 teatry
-- (Polonia, Och); TD będzie osobną organizacją z 1 teatrem.
-- Uruchom RĘCZNIE w Supabase SQL Editor — PRZED wdrożeniem kodu ze scopingiem.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  slug                    text unique not null,
  coord_password          text,          -- hasło koordynatora (na razie plaintext, spójnie z obecnym modelem)
  actor_password          text,          -- hasło aktora
  planning_horizon_months int  not null default 2,
  active                  boolean not null default true,
  created_at              timestamptz default now()
);

alter table public.organizations enable row level security;  -- deny-by-default; service_role omija

-- Organizacja bazowa: Fundacja Krystyny Jandy (Polonia + Och). Stały UUID —
-- używany w backfillu (migracja org-id) i w kodzie.
-- UWAGA: ustaw poniżej realne hasła (obecne prod COORD_PASSWORD / ACTOR_PASSWORD),
-- bo od teraz logowanie sprawdza hasła z tej tabeli, nie z env.
insert into public.organizations (id, name, slug, coord_password, actor_password, planning_horizon_months)
values ('11111111-1111-1111-1111-111111111111',
        'Fundacja Krystyny Jandy', 'fundacja-kj',
        'ZMIEN_koord', 'ZMIEN_aktor', 6)
on conflict (id) do nothing;
