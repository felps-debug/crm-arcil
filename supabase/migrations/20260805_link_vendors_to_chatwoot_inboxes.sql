-- Liga vendors ao Chatwoot. Antes o único campo era chatwoot_agent_id, com
-- valores 'agent_01'..'agent_06' — placeholders que não apontam para nada: os
-- ids do Chatwoot são numéricos. Sem isso o CRM não tem como saber para qual
-- inbox transferir no handoff, e /agentes e /atendimento falavam de pessoas
-- diferentes sem nenhuma chave em comum.
--
-- Só os 3 agentes de IA entram:
--   Thiago  → INSTALLER            → inbox 15 "Thiago - Instaladores"
--   Claudio → BUILDER + ARCHITECT  → inbox 13 "Claudio - Construtor"
--   Ana Paula (= "Ana") → CONSUMER → inbox 29 "Ana - Consumidor Final"
--
-- Os demais inboxes do Chatwoot (Rodiney 23, Alex 22, Vantuir 24, Vinicius 30)
-- são vendedores de outras áreas e ficam fora do CRM por decisão do time.
-- RESELLER ainda não foi atribuído a ninguém.

alter table public.vendors add column if not exists chatwoot_inbox_id integer;

comment on column public.vendors.chatwoot_inbox_id is
  'Inbox do Chatwoot que este agente de IA atende. Destino do handoff quando a conversa passa para humano.';

update public.vendors set chatwoot_inbox_id = 15 where name = 'Thiago';
update public.vendors set chatwoot_inbox_id = 13 where name = 'Claudio';
update public.vendors set chatwoot_inbox_id = 29 where name = 'Ana Paula';

-- Claudio atende construtores E arquitetos; estava só com BUILDER, então um
-- lead ARCHITECT não tinha agente nenhum.
update public.vendors set segment = array['BUILDER','ARCHITECT'] where name = 'Claudio';
