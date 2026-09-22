-- Tracos de performance: onde o tempo de cada carga foi gasto.
--
-- A auditoria de 2026-09-22 nao conseguiu separar navegador, rede, auth e
-- banco -- os logs de cada lado nao se cruzavam. Cada jornada (abrir o
-- dashboard, voltar a uma tela) ganha um trace_id gerado no browser e
-- propagado no header x-trace-id; browser e servidor gravam suas etapas aqui
-- com o mesmo id. Uma linha por etapa.
--
-- Privacidade (RF-021): user_id e o UUID, nunca e-mail, telefone, nome, token,
-- query string ou corpo. Quem grava e so o servidor, via service role, depois
-- de validar o payload (src/lib/perf/trace-validate.ts). Leitura so para
-- superadmin. Retencao de 30 dias via pg_cron.
--
-- Contrato: specs/001-otimizar-performance-crm/contracts/performance-traces.md
--
-- down:
--   select cron.unschedule('purge-performance-traces');
--   drop table if exists public.performance_traces;

create table if not exists public.performance_traces (
  id                bigint generated always as identity primary key,
  trace_id          uuid        not null,
  journey           text        not null check (journey in ('dashboard', 'leads', 'login', 'other')),
  origin            text        not null check (origin in ('browser', 'server')),
  stage             text        not null check (length(stage) <= 64),
  duration_ms       integer     not null check (duration_ms >= 0 and duration_ms < 600000),
  outcome           text        not null check (outcome in ('ok', 'error', 'forbidden', 'timeout')),
  load_kind         text                 check (load_kind in ('cold', 'warm')),
  supabase_requests smallint,
  route             text,
  deployment        text,
  region            text,
  -- sem FK de proposito: o traco sobrevive a exclusao do usuario
  user_id           uuid,
  created_at        timestamptz not null default now()
);

create index if not exists performance_traces_trace_id_idx on public.performance_traces (trace_id);
create index if not exists performance_traces_created_at_idx on public.performance_traces (created_at desc);

alter table public.performance_traces enable row level security;

-- Nenhuma politica de insert/update/delete: anon e authenticated nao escrevem.
-- O servidor grava com o service role, que ignora RLS.
create policy superadmin_read_performance_traces on public.performance_traces
  for select
  using ((select public.my_role()) = 'superadmin');

revoke all on public.performance_traces from anon;

comment on table public.performance_traces is
  'Etapas cronometradas de cada jornada do CRM (browser e servidor), cruzadas por trace_id. Sem dado pessoal. Retencao 30 dias.';

select cron.schedule(
  'purge-performance-traces',
  '17 3 * * *',
  $$delete from public.performance_traces where created_at < now() - interval '30 days'$$
);
