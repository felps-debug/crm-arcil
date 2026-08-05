-- Handoff rastreável. Até aqui não existia registro nenhum de encaminhamento:
-- leads.owner_name estava null em 6 de 6, e o kanban chegou a mostrar
-- "Encaminhado ao Vendedor" lendo conversations.vendor_id, que o n8n carimba na
-- abertura da conversa e não tem relação com handoff.
--
-- Com o handoff virando uma mensagem uazapi para o WhatsApp do vendedor, o CRM
-- precisa saber três coisas distintas:
--   handoff_vendor_id    para quem foi
--   handoff_sent_at      quando a mensagem saiu
--   handoff_accepted_at  quando o vendedor respondeu OK assumindo
--
-- Enviado sem aceite é o estado perigoso: o lead parece atendido e não está.
-- Separar as duas datas é o que permite medir tempo até um humano assumir e
-- alertar quando ninguém assume.

alter table public.leads
  add column if not exists handoff_vendor_id uuid references public.vendors(id),
  add column if not exists handoff_sent_at timestamptz,
  add column if not exists handoff_accepted_at timestamptz;

comment on column public.leads.handoff_vendor_id is
  'Vendedor que recebeu o handoff. Diferente de conversations.vendor_id, que é o agente de IA que atendeu.';
comment on column public.leads.handoff_sent_at is
  'Quando a mensagem de handoff foi enviada ao WhatsApp do vendedor via uazapi.';
comment on column public.leads.handoff_accepted_at is
  'Quando o vendedor confirmou que assumiu. Null com handoff_sent_at preenchido = aguardando aceite.';

-- Consulta do alerta: quem foi encaminhado e ninguém assumiu.
create index if not exists leads_handoff_pending_idx
  on public.leads (handoff_sent_at)
  where handoff_accepted_at is null;
