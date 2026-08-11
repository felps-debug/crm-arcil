-- Retomada de cobranca apos encerramento humano sem retorno.
-- A decisao financeira continua sendo registrada pelo RPC existente; este
-- complemento atribui uma data util de retorno sem alterar o contrato dele.

alter table public.financial_handoff_resolutions
  add column if not exists followup_at timestamptz,
  add column if not exists followup_status text not null default 'not_applicable'
    check (followup_status in ('not_applicable', 'scheduled', 'processing', 'sent', 'cancelled', 'failed'));

create index if not exists financial_handoff_resolutions_followup_due_idx
  on public.financial_handoff_resolutions (followup_at)
  where destination = 'sem_retorno' and followup_status = 'scheduled';

create or replace function public.add_business_days(p_start date, p_days integer)
returns date
language plpgsql
immutable
as $$
declare
  v_date date := p_start;
  v_added integer := 0;
begin
  if p_days < 0 then
    raise exception 'Quantidade de dias uteis nao pode ser negativa';
  end if;

  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6 then
      v_added := v_added + 1;
    end if;
  end loop;

  return v_date;
end;
$$;

create or replace function public.set_financial_handoff_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.destination = 'sem_retorno' then
    new.followup_at := coalesce(new.followup_at, public.add_business_days(current_date, 3)::timestamptz);
    new.followup_status := case
      when new.followup_status = 'not_applicable' then 'scheduled'
      else new.followup_status
    end;
  else
    new.followup_at := null;
    new.followup_status := 'not_applicable';
  end if;

  return new;
end;
$$;

drop trigger if exists financial_handoff_resolutions_followup_before_insert on public.financial_handoff_resolutions;
create trigger financial_handoff_resolutions_followup_before_insert
  before insert on public.financial_handoff_resolutions
  for each row execute function public.set_financial_handoff_followup();

create or replace function public.claim_due_financial_handoff_followups(p_limit integer default 50)
returns table (resolution_id uuid, lead_id uuid, cobranca_log_id uuid, wa_phone text)
language sql
security definer
set search_path = public
as $$
  update public.financial_handoff_resolutions r
     set followup_status = 'processing'
   where r.id in (
     select due.id
     from public.financial_handoff_resolutions due
     where due.destination = 'sem_retorno'
       and due.followup_status = 'scheduled'
       and due.followup_at <= now()
     order by due.followup_at
     for update skip locked
     limit greatest(1, least(p_limit, 100))
   )
  returning r.id, r.lead_id, r.cobranca_log_id,
    (select l.wa_phone from public.leads l where l.id = r.lead_id);
$$;

grant execute on function public.claim_due_financial_handoff_followups(integer) to service_role;
