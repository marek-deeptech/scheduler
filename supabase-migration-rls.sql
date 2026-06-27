-- ─────────────────────────────────────────────────────────────────────────────
-- RLS deny-by-default na wszystkich tabelach public.
-- Po tej migracji publiczny klucz anon NIE MA dostępu do żadnej tabeli.
-- Aplikacja działa, bo cały ruch idzie przez serwer z kluczem service_role
-- (proxy /rest/v1 oraz API routes), a service_role omija RLS.
-- URUCHOM RĘCZNIE w Supabase SQL editor — DOPIERO po wdrożeniu nowej wersji apki.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.theatres enable row level security;
alter table public.rooms enable row level security;
alter table public.teams enable row level security;
alter table public.artists enable row level security;
alter table public.productions enable row level security;
alter table public.artist_productions enable row level security;
alter table public.events enable row level security;
alter table public.event_artists enable row level security;
alter table public.event_types enable row level security;
alter table public.event_confirmations enable row level security;
alter table public.repertoire_proposals enable row level security;
alter table public.repertoire_slots enable row level security;
alter table public.slot_invites enable row level security;
alter table public.slot_availability enable row level security;
alter table public.availabilities enable row level security;
alter table public.actor_day_status enable row level security;
alter table public.actor_messages enable row level security;
alter table public.actor_substitutes enable row level security;
alter table public.chat_messages enable row level security;
alter table public.app_settings enable row level security;
alter table public.planning_assumptions enable row level security;
alter table public.google_accounts enable row level security;
alter table public.gcal_event_map enable row level security;

-- (Brak polityk = brak dostępu dla anon/public. service_role i tak omija RLS.)
