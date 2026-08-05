-- O handoff no Chatwoot NÃO é feito trocando de inbox. Inbox é o canal (um
-- número de WhatsApp) e uma conversa não migra entre inboxes. A transferência
-- real é PATCH /conversations/{id} com team_id e/ou assignee_id — exatamente o
-- que o nó "transfere team chatwoot1" do workflow INTEGRAÇÃO CHATWOOT CONFIGS
-- faz (hoje solto no canvas, sem conexão, com ids fixos).
--
-- Como todos os leads passam a entrar por um número só, chatwoot_inbox_id deixa
-- de ser o destino do handoff e vira só registro do número próprio de cada
-- vendedor. A chave do handoff é o time:
--
--   1 team consumer   2 team builder   3 team architect
--   4 team installer  5 team reseller  6 team financeiro
--
-- team architect (3) é redundante: arquiteto e construtor são o mesmo segmento.

alter table public.vendors add column if not exists chatwoot_team_id integer;

comment on column public.vendors.chatwoot_team_id is
  'Time do Chatwoot que recebe a conversa no handoff (PATCH /conversations/{id} team_id). Esta é a chave do handoff, não chatwoot_inbox_id.';

comment on column public.vendors.chatwoot_inbox_id is
  'Número/canal próprio do vendedor no Chatwoot. Registro apenas — o handoff usa chatwoot_team_id, porque conversa não muda de inbox.';

update public.vendors set chatwoot_team_id = 4 where name = 'Thiago';    -- team installer
update public.vendors set chatwoot_team_id = 2 where name = 'Claudio';   -- team builder
update public.vendors set chatwoot_team_id = 1 where name = 'Ana Paula'; -- team consumer
update public.vendors set chatwoot_team_id = 5 where name = 'Katia';     -- team reseller
