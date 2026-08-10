-- Controle manual de handoff financeiro.
--
-- Hoje os boletos vivem no snapshot cobranca_log.metadata.boletos; nao existe
-- cobranca_boletos ainda. As decisoes abaixo nunca alteram o snapshot nem baixam
-- titulos no ERP: apenas impedem que a IA mencione um documento confirmado pelo
-- financeiro enquanto a proxima carga ainda nao chegou.

create table if not exists public.cobranca_handoff_boleto_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cobranca_log_id uuid not null references public.cobranca_log(id) on delete cascade,
  empresa text not null,
  documento text not null,
  status text not null check (status in ('pago', 'renegociado')),
  note text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint cobranca_handoff_renegociado_note
    check (status <> 'renegociado' or length(trim(coalesce(note, ''))) > 0)
);

create unique index if not exists cobranca_handoff_boleto_active_idx
  on public.cobranca_handoff_boleto_decisions (cobranca_log_id, empresa, documento)
  where superseded_at is null;

create index if not exists cobranca_handoff_boleto_lead_active_idx
  on public.cobranca_handoff_boleto_decisions (lead_id, recorded_at desc)
  where superseded_at is null;

create table if not exists public.financial_handoff_resolutions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  cobranca_log_id uuid not null references public.cobranca_log(id) on delete restrict,
  destination text not null check (destination in ('devolver_ao_bot', 'sem_retorno')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  n8n_status text not null default 'pending' check (n8n_status in ('pending', 'delivered', 'failed')),
  n8n_delivered_at timestamptz,
  n8n_error text
);

create index if not exists financial_handoff_resolutions_pending_idx
  on public.financial_handoff_resolutions (recorded_at)
  where n8n_status = 'pending';

create or replace function public.finalize_financial_handoff(
  p_lead_id uuid,
  p_actor_id uuid,
  p_destination text,
  p_cobranca_log_id uuid,
  p_decisions jsonb default '[]'::jsonb
)
returns table (resolution_id uuid, wa_phone text, destination text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_metadata jsonb;
  v_resolution_id uuid;
  v_decision jsonb;
  v_empresa text;
  v_documento text;
  v_status text;
  v_note text;
begin
  if p_destination not in ('devolver_ao_bot', 'sem_retorno') then
    raise exception 'Destino invalido';
  end if;

  if jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'Decisoes devem ser uma lista';
  end if;

  select l.wa_phone
    into v_phone
    from public.leads l
   where l.id = p_lead_id
     and l.handoff_accepted_at is not null;

  if v_phone is null then
    raise exception 'Lead nao esta em handoff humano assumido';
  end if;

  select c.metadata
    into v_metadata
    from public.cobranca_log c
   where c.id = p_cobranca_log_id
     and right(regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 8)
       = right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 8);

  if v_metadata is null then
    raise exception 'Snapshot de cobranca nao pertence ao lead';
  end if;

  for v_decision in select value from jsonb_array_elements(p_decisions)
  loop
    v_empresa := trim(coalesce(v_decision->>'empresa', ''));
    v_documento := trim(coalesce(v_decision->>'documento', ''));
    v_status := v_decision->>'status';
    v_note := nullif(trim(coalesce(v_decision->>'note', '')), '');

    if v_empresa = '' or v_documento = '' or v_status not in ('pago', 'renegociado') then
      raise exception 'Decisao de boleto invalida';
    end if;

    if v_status = 'renegociado' and v_note is null then
      raise exception 'Informe a observacao da renegociacao';
    end if;

    if not exists (
      select 1
        from jsonb_array_elements(coalesce(v_metadata->'boletos', '[]'::jsonb)) as boleto(value)
       where coalesce(boleto.value->>'emp', '') = v_empresa
         and coalesce(boleto.value->>'documento', '') = v_documento
    ) then
      raise exception 'Boleto nao pertence ao snapshot de cobranca';
    end if;

    update public.cobranca_handoff_boleto_decisions
       set superseded_at = now()
     where cobranca_log_id = p_cobranca_log_id
       and empresa = v_empresa
       and documento = v_documento
       and superseded_at is null;

    insert into public.cobranca_handoff_boleto_decisions
      (lead_id, cobranca_log_id, empresa, documento, status, note, recorded_by)
    values
      (p_lead_id, p_cobranca_log_id, v_empresa, v_documento, v_status, v_note, p_actor_id);
  end loop;

  insert into public.financial_handoff_resolutions
    (lead_id, cobranca_log_id, destination, recorded_by)
  values
    (p_lead_id, p_cobranca_log_id, p_destination, p_actor_id)
  returning id into v_resolution_id;

  insert into public.activity_log (entity_type, entity_id, action, wf_origin, metadata)
  values (
    'lead',
    p_lead_id,
    'handoff_financeiro_finalizado',
    'crm',
    jsonb_build_object('resolution_id', v_resolution_id, 'destination', p_destination, 'decisions', p_decisions)
  );

  return query select v_resolution_id, v_phone, p_destination;
end;
$$;

-- O agente de cobranca deve ler somente esta view durante a transicao: ela usa o
-- ultimo snapshot por telefone e remove os documentos protegidos manualmente.
create or replace view public.cobranca_handoff_posicao_atual
with (security_invoker = true)
as
with snapshots as (
  select distinct on (right(regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 8))
    c.id,
    c.telefone,
    c.metadata,
    c.data_disparo,
    c.created_at
  from public.cobranca_log c
  where c.metadata ? 'boletos'
  order by
    right(regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 8),
    c.data_disparo desc nulls last,
    c.created_at desc
)
select
  s.id as cobranca_log_id,
  s.telefone,
  boleto.value->>'emp' as empresa,
  boleto.value->>'documento' as documento,
  (boleto.value->>'valor')::numeric as valor,
  boleto.value->>'vencimento' as vencimento,
  boleto.value->>'status' as status,
  boleto.value->>'observacao' as observacao,
  s.data_disparo,
  s.created_at
from snapshots s
cross join lateral jsonb_array_elements(s.metadata->'boletos') as boleto(value)
where not exists (
  select 1
  from public.cobranca_handoff_boleto_decisions d
  where d.cobranca_log_id = s.id
    and d.empresa = coalesce(boleto.value->>'emp', '')
    and d.documento = coalesce(boleto.value->>'documento', '')
    and d.superseded_at is null
);

alter table public.cobranca_handoff_boleto_decisions enable row level security;
alter table public.financial_handoff_resolutions enable row level security;

revoke all on public.cobranca_handoff_boleto_decisions from anon, authenticated;
revoke all on public.financial_handoff_resolutions from anon, authenticated;
revoke all on function public.finalize_financial_handoff(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.finalize_financial_handoff(uuid, uuid, text, uuid, jsonb) to service_role;
