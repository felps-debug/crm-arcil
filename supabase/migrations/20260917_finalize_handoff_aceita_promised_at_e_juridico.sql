-- Acompanha 20260917_renegociado_com_data_e_estado_juridico: o RPC precisa
-- aceitar o novo status `juridico` e gravar `promised_at`, senao a UI nao
-- consegue registrar a data prometida nem o caso "esta com o advogado".
--
-- Regras novas, espelhando o que parseFinancialHandoffPayload valida no app:
--   * renegociado e juridico exigem observacao (boleto que para de ser cobrado
--     sem explicacao vira misterio um mes depois)
--   * renegociado exige promised_at, e a data nao pode estar no passado -- e ela
--     que traz a cobranca de volta sozinha
--   * promised_at so persiste em renegociado; nos outros status e descartado

create or replace function public.finalize_financial_handoff(
  p_lead_id uuid,
  p_actor_id uuid,
  p_destination text,
  p_cobranca_log_id uuid,
  p_decisions jsonb default '[]'::jsonb
)
returns table(resolution_id uuid, wa_phone text, destination text, followup_at timestamp with time zone, tinha_handoff boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone text;
  v_aceito timestamptz;
  v_metadata jsonb;
  v_resolution_id uuid;
  v_decision jsonb;
  v_empresa text;
  v_documento text;
  v_status text;
  v_note text;
  v_promised_at date;
  v_followup_at timestamptz;
  v_tinha_handoff boolean;
begin
  if p_destination not in ('devolver_ao_bot', 'sem_retorno') then
    raise exception 'Destino invalido';
  end if;

  if jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'Decisoes devem ser uma lista';
  end if;

  select l.wa_phone, l.handoff_accepted_at
    into v_phone, v_aceito
    from public.leads l
   where l.id = p_lead_id;

  if v_phone is null then
    raise exception 'Lead sem telefone cadastrado';
  end if;

  v_tinha_handoff := v_aceito is not null;

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
    v_promised_at := nullif(trim(coalesce(v_decision->>'promisedAt', '')), '')::date;

    if v_empresa = '' or v_documento = '' or v_status not in ('pago', 'renegociado', 'juridico') then
      raise exception 'Decisao de boleto invalida';
    end if;

    -- Renegociado e juridico sao divida viva: precisam de justificativa escrita,
    -- senao ninguem entende depois por que o boleto parou de ser cobrado.
    if v_status <> 'pago' and v_note is null then
      raise exception 'Informe a observacao do boleto';
    end if;

    -- A data prometida e o que faz a cobranca voltar sozinha. Sem ela o caso
    -- some da mesa e so um bilhete em caixa alta lembra alguem.
    if v_status = 'renegociado' then
      if v_promised_at is null then
        raise exception 'Informe a data prometida da renegociacao';
      end if;
      if v_promised_at < current_date then
        raise exception 'A data prometida nao pode estar no passado';
      end if;
    end if;

    if v_status <> 'renegociado' then
      v_promised_at := null;
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
      (lead_id, cobranca_log_id, empresa, documento, status, note, promised_at, recorded_by)
    values
      (p_lead_id, p_cobranca_log_id, v_empresa, v_documento, v_status, v_note, v_promised_at, p_actor_id);
  end loop;

  -- Sem handoff nao existe bloqueio de bot para segurar, entao nao ha retorno a
  -- agendar: o cliente nunca saiu do atendimento automatico.
  if p_destination = 'sem_retorno' and v_tinha_handoff then
    v_followup_at := public.add_business_days(now(), 3);
  else
    v_followup_at := null;
  end if;

  insert into public.financial_handoff_resolutions
    (lead_id, cobranca_log_id, destination, recorded_by, followup_at, followup_status)
  values
    (p_lead_id, p_cobranca_log_id, p_destination, p_actor_id, v_followup_at,
     case when v_followup_at is not null then 'scheduled' else 'not_applicable' end)
  returning id into v_resolution_id;

  insert into public.activity_log (entity_type, entity_id, action, wf_origin, metadata)
  values (
    'lead',
    p_lead_id,
    'handoff_financeiro_finalizado',
    'crm',
    jsonb_build_object(
      'resolution_id', v_resolution_id,
      'destination', p_destination,
      'followup_at', v_followup_at,
      'tinha_handoff', v_tinha_handoff,
      'decisions', p_decisions
    )
  );

  return query select v_resolution_id, v_phone, p_destination, v_followup_at, v_tinha_handoff;
end;
$function$;
