-- Registro simples de "a Priscila/Simone respondeu OK e assumiu o handoff",
-- separado do board financeiro (que continua usando handoff_accepted_at /
-- finalize_financial_handoff). Só um timestamp de quando o "ok" chegou.
alter table public.leads
  add column if not exists handoff_staff_ok_at timestamptz;
