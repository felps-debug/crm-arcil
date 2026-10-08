-- Vários números do Chatwoot por usuário.
--
-- `chatwoot_inbox_id` (texto) liga o usuário a UM inbox. Quem acompanha mais de
-- um número (ex.: o gestor dos instaladores vê Thiago, Rodiney e Alex) precisa de
-- lista. As duas colunas valem juntas — o vínculo antigo continua funcionando,
-- sem migração de dados (ver parseInboxIds em src/lib/server/inbox-scope.ts).
alter table public.user_profiles
  add column if not exists chatwoot_inbox_ids integer[] not null default '{}';

comment on column public.user_profiles.chatwoot_inbox_ids is
  'Inboxes do Chatwoot que o usuário pode ver em /atendimento (vendor/employee/installer_manager). Soma com chatwoot_inbox_id. Ignorada para superadmin/owner/manager, que veem todos.';
