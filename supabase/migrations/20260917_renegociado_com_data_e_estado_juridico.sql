-- Renegociado nao e resolvido, e juridico nao e quitado.
--
-- Em 17/09/2026 o financeiro marcou um boleto de R$ 687,43 como `renegociado`
-- com a observacao "vai pagar dia 10/10 / VERIFICAR PARA NAO ESQUECER" e o card
-- foi parar na coluna RESOLVIDO com "R$ 0,00 / 0 boletos em aberto". Ela nao
-- errou: a view cobranca_handoff_posicao_atual descartava o boleto na presenca
-- de QUALQUER decisao viva, `pago` ou `renegociado`. Somando o caso do Sergio
-- (R$ 1.896,90 em negociacao com advogado, marcado desde 15/09), havia
-- R$ 2.584,33 de divida viva escondidos como se estivessem quitados.
--
-- Alem disso a data prometida nao tinha onde morar: virava texto solto numa
-- observacao. Por isso o "VERIFICAR PARA NAO ESQUECER" em caixa alta -- ela
-- percebeu que o sistema ia esquecer e tentou compensar na mao.
--
--   1. so `pago` fecha o boleto; renegociado e juridico seguem em aberto
--   2. `promised_at` passa a existir e e obrigatorio em renegociado
--   3. novo status `juridico`: para a regua de cobranca mas mantem a divida
--      visivel -- o caso "esta com o advogado, nao cobrar"

alter table public.cobranca_handoff_boleto_decisions
  add column if not exists promised_at date;

comment on column public.cobranca_handoff_boleto_decisions.promised_at is
  'Data em que o cliente prometeu pagar. Obrigatoria em status=renegociado. '
  'Antes disso a data so existia como texto livre em `note` e ninguem era lembrado.';

alter table public.cobranca_handoff_boleto_decisions
  drop constraint if exists cobranca_handoff_boleto_decisions_status_check;

alter table public.cobranca_handoff_boleto_decisions
  add constraint cobranca_handoff_boleto_decisions_status_check
  check (status = any (array['pago'::text, 'renegociado'::text, 'juridico'::text]));

-- juridico tambem precisa de justificativa, pelo mesmo motivo que renegociado
alter table public.cobranca_handoff_boleto_decisions
  drop constraint if exists cobranca_handoff_renegociado_note;

alter table public.cobranca_handoff_boleto_decisions
  add constraint cobranca_handoff_renegociado_note
  check (status = 'pago'::text or length(btrim(coalesce(note, ''::text))) > 0);

-- Sergio Briega: negociacao conduzida pelo advogado que cuida dos casos
-- especificos de cobranca. Confirmado pela operacao em 17/09/2026: o agente nao
-- deve cobrar nem fazer follow-up, mas a divida continua existindo.
-- Precisa vir ANTES da constraint de promised_at -- estas linhas sao
-- renegociado vivo sem data, que e exatamente o que a constraint proibe.
update public.cobranca_handoff_boleto_decisions
   set status = 'juridico'
 where status = 'renegociado'
   and superseded_at is null
   and note ilike '%advogada%';

-- Linhas ja aposentadas ficam de fora: nasceram antes da coluna existir e nao
-- ha data a recuperar.
alter table public.cobranca_handoff_boleto_decisions
  add constraint cobranca_handoff_renegociado_promised_at
  check (status <> 'renegociado'::text or promised_at is not null or superseded_at is not null);

create or replace view public.cobranca_handoff_posicao_atual as
 with snapshots as (
   select distinct on ((right(regexp_replace(coalesce(c.telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 8)))
          c.id, c.telefone, c.metadata, c.data_disparo, c.created_at
     from cobranca_log c
    where c.metadata ? 'boletos'::text
    order by (right(regexp_replace(coalesce(c.telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 8)),
             c.data_disparo desc nulls last, c.created_at desc
 )
 select s.id as cobranca_log_id,
        s.telefone,
        boleto.value ->> 'emp'::text as empresa,
        boleto.value ->> 'documento'::text as documento,
        parse_cobranca_valor(boleto.value ->> 'valor'::text) as valor,
        boleto.value ->> 'vencimento'::text as vencimento,
        boleto.value ->> 'status'::text as status,
        boleto.value ->> 'observacao'::text as observacao,
        s.data_disparo,
        s.created_at
   from snapshots s
   cross join lateral jsonb_array_elements(s.metadata -> 'boletos'::text) boleto(value)
  where not (exists (
          select 1
            from cobranca_handoff_boleto_decisions d
            join cobranca_log decided_snapshot on decided_snapshot.id = d.cobranca_log_id
           where right(regexp_replace(coalesce(decided_snapshot.telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 8)
               = right(regexp_replace(coalesce(s.telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 8)
             and d.empresa = coalesce(boleto.value ->> 'emp'::text, ''::text)
             and d.documento = coalesce(boleto.value ->> 'documento'::text, ''::text)
             and d.superseded_at is null
             -- A MUDANCA: antes era qualquer decisao viva. Agora so o pagamento
             -- tira o boleto de cima da mesa. Renegociado e juridico continuam
             -- sendo divida, e precisam aparecer no total em aberto.
             and d.status = 'pago'::text));
