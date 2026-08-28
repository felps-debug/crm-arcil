-- cobranca_handoff_posicao_atual quebrava com "invalid input syntax for type
-- numeric" (22P02) assim que um boleto real chegava: o valor no metadata do
-- disparo vem em formato BR ("1.866,69" — ponto de milhar, vírgula decimal),
-- e `(boleto.value->>'valor')::numeric` tenta converter essa string direto,
-- o que o Postgres nunca aceita. A view existe desde 20260810 mas só quebrou
-- na prática em 2026-08-24, quando a tela "Atendimentos financeiros" foi
-- aberta pela primeira vez contra um disparo real — até então nunca tinha
-- boleto de verdade passando por ela pra expor o bug.
--
-- Mesma lógica de `parseCobrancaMoney()` em src/lib/server/crm-data.ts:
-- havendo vírgula, o ponto é separador de milhar (remove) e a vírgula vira
-- ponto decimal; sem vírgula, assume que já é um decimal válido. Se depois
-- de normalizar ainda não for um número, devolve NULL em vez de derrubar a
-- view inteira — um boleto com valor ilegível não pode impedir os outros 21
-- de aparecerem.
create or replace function public.parse_cobranca_valor(input text)
returns numeric
language sql
immutable
as $$
  select case
    when input is null or btrim(input) = '' then null
    else (
      select case when normalizado ~ '^-?[0-9]+(\.[0-9]+)?$' then normalizado::numeric else null end
      from (
        select case
          when input ~ ','
            then replace(replace(regexp_replace(input, '[^0-9,.-]', '', 'g'), '.', ''), ',', '.')
          else regexp_replace(input, '[^0-9.-]', '', 'g')
        end as normalizado
      ) t
    )
  end
$$;

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
  public.parse_cobranca_valor(boleto.value->>'valor') as valor,
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
