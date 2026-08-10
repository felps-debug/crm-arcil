-- A decisão humana permanece válida mesmo se uma nova carga criar outro
-- snapshot antes de o ERP refletir a baixa/renegociação.
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
  join public.cobranca_log decided_snapshot on decided_snapshot.id = d.cobranca_log_id
  where right(regexp_replace(coalesce(decided_snapshot.telefone, ''), '[^0-9]', '', 'g'), 8)
      = right(regexp_replace(coalesce(s.telefone, ''), '[^0-9]', '', 'g'), 8)
    and d.empresa = coalesce(boleto.value->>'emp', '')
    and d.documento = coalesce(boleto.value->>'documento', '')
    and d.superseded_at is null
);
