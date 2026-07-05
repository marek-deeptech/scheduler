-- ─────────────────────────────────────────────────────────────────────────────
-- Moduł cyklicznych powiadomień aktorów (KPA) — reguły + log wysyłek
-- Uruchom ręcznie w Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists notification_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  active        boolean not null default true,
  -- kiedy: 'weekly' (weekday) | 'monthly' (day_of_month) | 'before_event' (event_type + days_before)
  trigger_type  text not null check (trigger_type in ('weekly','monthly','before_event')),
  weekday       int,                                   -- 0=Nd .. 6=Sb
  day_of_month  int,                                   -- 1..28
  event_type    text,                                  -- np. 'Premiera'
  days_before   int,                                   -- np. 7
  -- co: zakres treści + filtr kategorii wydarzeń
  scope         text not null default 'this_week',     -- this_week|next_week|this_month|next_month|event
  event_types   text[] not null default '{}',          -- 'spektakle'|'proby'|'premiery'; puste = wszystko
  -- do kogo
  audience      text not null default 'all_cast',      -- all_cast|team|core|production|event_cast|custom|technique|sales
  audience_ref  jsonb,                                 -- {team_id}|{production_id}|{artist_ids:[]}
  personalized  boolean not null default true,         -- true = własny grafik aktora; false = wspólny digest
  channel       text not null default 'email' check (channel in ('email','sms','both')),
  send_time     text default '08:00',
  subject       text,
  body          text,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists notification_deliveries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  rule_id        uuid not null references notification_rules(id) on delete cascade,
  occurrence_key text not null,                         -- '2026-W28' | '2026-11' | <event_id>
  recipient      text not null,                         -- artist_id lub e-mail działu
  artist_id      uuid,
  channel        text not null,
  status         text not null default 'sent',
  sent_at        timestamptz not null default now(),
  unique (rule_id, occurrence_key, recipient, channel)
);

create index if not exists idx_notif_rules_org   on notification_rules(org_id, active);
create index if not exists idx_notif_deliv_lookup on notification_deliveries(rule_id, occurrence_key);

-- RLS deny-by-default (service_role w proxy i tak omija; klient scopowany org_id w proxy)
alter table notification_rules      enable row level security;
alter table notification_deliveries enable row level security;

-- ── Seed 3 presetów dla każdej organizacji ───────────────────────────────────
insert into notification_rules (org_id, name, active, trigger_type, weekday, day_of_month, event_type, days_before, scope, event_types, audience, personalized, channel, send_time, subject, body)
select o.id, r.name, r.active, r.trigger_type, r.weekday, r.day_of_month, r.event_type, r.days_before, r.scope, r.event_types, r.audience, r.personalized, r.channel, r.send_time, r.subject, r.body
from organizations o
cross join (values
  ('Tygodniowy plan', true, 'weekly', 1, null, null, null, 'this_week', '{}'::text[], 'all_cast', true, 'email', '08:00',
   'Twój plan na ten tydzień', 'Cześć {name}, poniżej Twoje spektakle i próby w tym tygodniu ({weekLabel}). Szczegóły w harmonogramie.'),
  ('Miesięczny repertuar', true, 'monthly', null, 1, null, null, 'this_month', '{}'::text[], 'all_cast', false, 'email', '08:00',
   'Repertuar na {monthLabel}', 'Repertuar na {monthLabel} — pełny harmonogram spektakli i prób poniżej.'),
  ('Przypomnienie o premierze (T-7)', true, 'before_event', null, null, 'Premiera', 7, 'event', '{}'::text[], 'event_cast', false, 'both', '08:00',
   'Premiera za tydzień: {eventTitle}', 'Za 7 dni premiera „{eventTitle}" ({date}). Szczegóły i obsada poniżej.')
) as r(name, active, trigger_type, weekday, day_of_month, event_type, days_before, scope, event_types, audience, personalized, channel, send_time, subject, body)
where not exists (
  select 1 from notification_rules nr where nr.org_id = o.id and nr.name = r.name
);
