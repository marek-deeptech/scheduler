-- ─────────────────────────────────────────────────────────────────────────────
-- MULTI-TENANCY (Etap 1) — org_id na wszystkich tabelach najemcy + backfill.
-- Backfill: wszystkie istniejące dane → Fundacja KJ. Globalne (bez org_id):
-- teams, event_types.
-- Uruchom RĘCZNIE PO migracji organizations, a PRZED wdrożeniem scopingu.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  fund uuid := '11111111-1111-1111-1111-111111111111';
  t text;
  cn text;
  tenant text[] := array[
    'artists','productions','theatres','rooms','events','event_artists',
    'repertoire_proposals','repertoire_slots','event_confirmations','actor_messages',
    'actor_day_status','artist_productions','availabilities','slot_invites','slot_availability',
    'planning_assumptions','actor_production_substitutes','chat_messages','gcal_event_map',
    'google_accounts','calendar_invites','app_settings'
  ];
begin
  foreach t in array tenant loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name = t) then
      execute format('alter table public.%I add column if not exists org_id uuid', t);
      execute format('update public.%I set org_id = %L where org_id is null', t, fund);
      -- DEFAULT = Fundacja: siatka bezpieczeństwa dla zapisów serwerowych bez jawnego
      -- org (Etap 1 = jedna org). PRZED wejściem TD (Etap 2) usuń default i upewnij
      -- się, że wszystkie trasy API ustawiają org_id jawnie.
      execute format('alter table public.%I alter column org_id set default %L', t, fund);
      execute format('alter table public.%I alter column org_id set not null', t);
      cn := t || '_org_fk';
      execute format('alter table public.%I drop constraint if exists %I', t, cn);
      execute format('alter table public.%I add constraint %I foreign key (org_id) references public.organizations(id)', t, cn);
      execute format('create index if not exists %I on public.%I(org_id)', t || '_org_idx', t);
    end if;
  end loop;
end $$;

-- app_settings: unikalność per (org_id, key) zamiast per (key) — każda org ma
-- własną konfigurację. Usuń wszystkie unikalne ograniczenia obejmujące SAM klucz.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'app_settings' and con.contype in ('u','p')
      and (select array_agg(att.attname order by att.attnum)
           from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k) = array['key']
  loop
    execute format('alter table public.app_settings drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists app_settings_org_key_uidx on public.app_settings(org_id, key);
