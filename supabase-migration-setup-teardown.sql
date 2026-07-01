-- ─────────────────────────────────────────────────────────────────────────────
-- Montaż / Demontaż scenografii — czas (w dniach roboczych) potrzebny na
-- postawienie i rozebranie scenografii tytułu. Blokuje scenę dla innych
-- spektakli (patrz generator: zmiana tytułu na scenie wymaga demontażu
-- poprzedniego + montażu następnego).
-- Uruchom RĘCZNIE w Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.productions
  add column if not exists setup_days    int not null default 0,   -- montaż (dni robocze)
  add column if not exists teardown_days int not null default 0;   -- demontaż (dni robocze)
