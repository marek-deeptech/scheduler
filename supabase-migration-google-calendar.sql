-- ─────────────────────────────────────────────────────────────────────────────
-- Google Calendar — integracja (Opcja B: OAuth + push przez Calendar API)
-- Uruchom RĘCZNIE w Supabase SQL editor (apka ma tylko anon-key, brak DDL z kodu).
-- ─────────────────────────────────────────────────────────────────────────────

-- Połączone konta Google (na start: tylko Marek = koordynator, receive_all = true).
-- Gdy skalujemy na wszystkich: każdy artysta dostaje wiersz z artist_id (receive_all = false),
-- i sync pushuje mu tylko eventy, w których występuje (event_artists).
create table if not exists google_accounts (
  owner_key      text primary key,           -- stały identyfikator (np. 'marek-mielnicki' lub email)
  email          text,                        -- email konta Google (z userinfo)
  artist_id      uuid references artists(id) on delete set null,  -- powiązanie z artystą (skalowanie)
  receive_all    boolean not null default false,                  -- true = dostaje WSZYSTKIE eventy (koordynator)
  refresh_token  text not null,
  calendar_id    text not null default 'primary',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Mapa: event w apce  →  event w Google (per konto). Niezbędna do update/delete.
create table if not exists gcal_event_map (
  event_id         uuid not null,
  owner_key        text not null references google_accounts(owner_key) on delete cascade,
  google_event_id  text not null,
  updated_at       timestamptz not null default now(),
  primary key (event_id, owner_key)
);

create index if not exists gcal_event_map_event_idx on gcal_event_map(event_id);

-- RLS: tabele dostępne wyłącznie z service-role (klucz serwerowy na Vercel).
-- Brak policy = anon/auth nie ma dostępu; service-role omija RLS.
alter table google_accounts  enable row level security;
alter table gcal_event_map   enable row level security;
