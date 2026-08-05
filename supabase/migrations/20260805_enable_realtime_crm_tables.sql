-- O CRM assina postgres_changes nestas tabelas:
--   /          → leads, sales, billing
--   /leads     → leads, followups, conversations
--   /cobranca  → cobranca_log
-- Mas a publicação supabase_realtime só continha cobranca_log e prospeccoes.
-- As assinaturas conectavam com sucesso e nunca recebiam um único evento — por
-- isso apenas /cobranca era "ao vivo" e o dashboard/kanban só mudavam com F5.
--
-- REPLICA IDENTITY FULL é necessário para o Realtime entregar o registro antigo
-- em UPDATE/DELETE e aplicar RLS sobre ele (cobranca_log já estava assim).

alter table public.leads         replica identity full;
alter table public.followups     replica identity full;
alter table public.conversations replica identity full;
alter table public.sales         replica identity full;
alter table public.billing       replica identity full;
alter table public.quotes        replica identity full;

alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.followups;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.billing;
alter publication supabase_realtime add table public.quotes;

-- sales e billing têm RLS habilitado e ZERO policies: o Realtime filtra cada
-- evento pela RLS do usuário, então sem policy de SELECT nenhum evento chega ao
-- browser (e o dashboard nunca lê receita fechada fora do service role).
create policy staff_read_sales on public.sales
  for select
  using (my_role() = any (array['superadmin','owner','manager','vendor','employee']));

create policy staff_read_billing on public.billing
  for select
  using (my_role() = any (array['superadmin','owner','manager','vendor','employee']));
