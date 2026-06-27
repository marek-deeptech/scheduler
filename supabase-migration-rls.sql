-- ─────────────────────────────────────────────────────────────────────────────
-- RLS deny-by-default na WSZYSTKICH tabelach public.
-- Po tej migracji publiczny klucz anon NIE MA dostępu do żadnej tabeli.
-- Aplikacja działa, bo cały ruch idzie przez serwer z kluczem service_role
-- (proxy /rest/v1 oraz API routes), a service_role omija RLS.
-- Wersja odporna: iteruje po realnie istniejących tabelach (pomija nieistniejące).
-- URUCHOM RĘCZNIE w Supabase SQL editor — DOPIERO po wdrożeniu nowej wersji apki.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- Usuń wszystkie zalegające polityki (np. stare token-owe na event_confirmations),
-- które wpuszczały anon. Apka czyta wszystko przez service_role (omija RLS),
-- więc żadne polityki nie są potrzebne — pełne odcięcie publicznego klucza anon.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename);
  end loop;
end $$;

-- (Brak polityk = brak dostępu dla anon/public. service_role i tak omija RLS.)
