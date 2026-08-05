-- 'Ana Paula Costa' é duplicata da 'Ana Paula' já cadastrada (inbox 29), e
-- 'Marcos Vieira' não existe na operação. Ambos estavam active = false e sem
-- nenhuma conversa, quote ou sale apontando para eles — verificado antes de
-- apagar.
--
-- Eles também eram metade da contagem duplicada da aba /agentes: 'Ana Paula
-- Costa' [CONSUMER] reclamava os mesmos leads da 'Ana Paula', e 'Marcos Vieira'
-- [BUILDER, INSTALLER] os mesmos do Claudio e do Thiago.
--
-- Katia fica: pode virar o handoff de RESELLER, ainda não definido.

delete from public.vendors
where name in ('Ana Paula Costa', 'Marcos Vieira')
  and active = false
  and not exists (select 1 from public.conversations c where c.vendor_id = vendors.id)
  and not exists (select 1 from public.quotes q where q.vendor_id = vendors.id)
  and not exists (select 1 from public.sales s where s.vendor_id = vendors.id);
