-- `not_applicable` nunca coube na constraint, e ninguem percebeu.
--
-- Quando o financeiro so baixa boleto de um lead que nunca saiu do atendimento
-- automatico, nao ha bloqueio de bot para liberar -- avisar o n8n ali mandaria
-- apagar uma chave que nunca existiu. A rota trata esse caso gravando
-- n8n_status = 'not_applicable'... valor que esta CHECK recusava desde sempre.
--
-- Como aquele UPDATE e o unico dos tres da rota que nao confere o `error`
-- retornado, a recusa era engolida e a linha ficava no DEFAULT 'pending'.
-- Resultado: 12 resolucoes (09/09 a 17/09) parecendo entrega pendente para o
-- n8n, sendo que nenhuma delas tinha o que entregar -- todas de leads com
-- handoff_accepted_at nulo. As 7 `delivered` e as 3 `failed` sao justamente as
-- que tinham handoff de verdade.
--
-- A checagem do erro no codigo vai junto, em src/app/api/leads/[id]/financial-handoff.

alter table public.financial_handoff_resolutions
  drop constraint if exists financial_handoff_resolutions_n8n_status_check;

alter table public.financial_handoff_resolutions
  add constraint financial_handoff_resolutions_n8n_status_check
  check (n8n_status = any (array['pending'::text, 'delivered'::text, 'failed'::text, 'not_applicable'::text]));

-- Corrige o historico: pending + lead sem handoff = nunca houve nada a entregar.
-- Nao mexe em pending de lead que teve handoff (nao existe hoje, mas se surgir
-- e entrega travada de verdade e precisa continuar visivel).
update public.financial_handoff_resolutions r
   set n8n_status = 'not_applicable'
  from public.leads l
 where l.id = r.lead_id
   and r.n8n_status = 'pending'
   and l.handoff_accepted_at is null;
