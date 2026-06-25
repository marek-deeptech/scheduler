-- ─────────────────────────────────────────────────────────────────────────────
-- Zaproszenia kalendarzowe dla aktorów (iCalendar / .ics)
-- Śledzi UID + SEQUENCE per (event, aktor), żeby aktualizacje podmieniały wpis,
-- a odwołania (CANCEL) go usuwały. Uruchom RĘCZNIE w Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists calendar_invites (
  event_id   uuid not null,
  artist_id  uuid not null,
  uid        text not null,                 -- stały UID iCal: <event>.<artist>@domena
  sequence   int  not null default 0,       -- rośnie przy każdej wysyłce/zmianie
  status     text not null default 'confirmed',  -- confirmed | cancelled
  updated_at timestamptz not null default now(),
  primary key (event_id, artist_id)
);

create index if not exists calendar_invites_event_idx on calendar_invites(event_id);

-- Brak RLS (spójnie z resztą tabel apki używanych przez anon-key) — dane
-- nie są wrażliwe (tylko numery sekwencji zaproszeń).
