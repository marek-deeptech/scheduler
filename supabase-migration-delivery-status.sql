-- ─────────────────────────────────────────────────────────────────────────────
-- P1 #6 — Statusy doręczenia wiadomości (delivered / bounced / failed).
-- Webhooki Resend (e-mail) i SMSAPI (SMS) zapisują tu realny status dostarczenia.
-- Uruchom RĘCZNIE w Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Status doręczenia + id wiadomości u dostawcy (do mapowania webhooka → rekord).
alter table public.actor_messages
  add column if not exists delivery_status text,        -- sent | delivered | opened | bounced | failed
  add column if not exists provider_msg_id  text,       -- id z Resend / SMSAPI
  add column if not exists delivered_at      timestamptz;

create index if not exists actor_messages_provider_msg_id_idx
  on public.actor_messages(provider_msg_id);

-- (Brak polityk — service_role omija RLS; webhooki działają serwerowo.)
