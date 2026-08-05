-- Fecha os buracos de roteamento do handoff. Sem estas linhas, o segmento
-- COBRANCA não tem destino em vendors e RESELLER aponta para a Katia, que está
-- inativa e sem telefone — os dois cairiam no número fixo do fluxo antigo
-- (554491493667, chumbado nos três nós de envio do ENCAMINHADOR HUMANO).
--
-- Número da cobrança confirmado no WhatsApp via arcil.uazapi.com:
--   5544998383330 -> 554498383330@s.whatsapp.net

insert into public.vendors (name, segment, chatwoot_agent_id, wa_phone, active, chatwoot_team_id, chatwoot_label)
values ('Cobrança', array['COBRANCA'], 'cobranca', '5544998383330', true, 6, 'tag_suporte_financeiro')
on conflict do nothing;

-- Ana passa a atender revenda também até a Katia (ou outra pessoa) assumir.
update public.vendors set segment = array['CONSUMER','RESELLER'] where name = 'Ana Paula';

-- Katia sai de RESELLER para não competir pelo segmento na atribuição.
update public.vendors set segment = array[]::text[] where name = 'Katia';
