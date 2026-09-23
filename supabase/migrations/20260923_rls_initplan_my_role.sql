-- RLS: my_role() avaliado uma vez por consulta, nao uma vez por linha.
--
-- As politicas chamavam my_role() direto na expressao. Para o Postgres isso e
-- uma funcao por linha: cada SELECT do browser, e cada evento do realtime (que
-- checa RLS por assinante), relia user_profiles para cada linha avaliada.
-- Embrulhado em (select ...), vira InitPlan -- avaliado uma vez por consulta.
-- Recomendacao do Supabase: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- O RESULTADO da autorizacao nao muda: mesma expressao, mesmos papeis, mesmos
-- nomes. alter policy troca so a expressao, sem janela em que a tabela fique
-- sem politica (drop + create teria essa janela).
--
-- Estado anterior salvo em specs/001-otimizar-performance-crm/rls-before.json.
--
-- down (reaplicar as expressoes originais):
--   alter policy staff_read_activity_log on public.activity_log
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_billing on public.billing
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_insert_boleto_decisions on public.cobranca_handoff_boleto_decisions
--     with check ((my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (recorded_by = ( SELECT auth.uid() AS uid)));
--   alter policy staff_read_cobranca_handoff_boleto_decisions on public.cobranca_handoff_boleto_decisions
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_update_boleto_decisions on public.cobranca_handoff_boleto_decisions
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]))
--     with check (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy authorized_insert_cobranca_log on public.cobranca_log
--     with check (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]));
--   alter policy staff_read_cobranca_log on public.cobranca_log
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_conversations on public.conversations
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_insert_crm_image_generations on public.crm_image_generations
--     with check ((my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (generated_by = ( SELECT auth.uid() AS uid)));
--   alter policy staff_read_crm_image_generations on public.crm_image_generations
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_insert_financial_handoff_resolutions on public.financial_handoff_resolutions
--     with check ((my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (recorded_by = ( SELECT auth.uid() AS uid)));
--   alter policy staff_read_financial_handoff_resolutions on public.financial_handoff_resolutions
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_followups on public.followups
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_image_generations on public.image_generations
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_leads on public.leads
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_messages on public.messages
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_products_builder_architect on public.products_builder_architect
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_products_consumer on public.products_consumer
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_products_installer on public.products_installer
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_products_reseller on public.products_reseller
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_quotes on public.quotes
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy staff_read_sales on public.sales
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
--   alter policy read_own_or_superadmin on public.user_profiles
--     using ((( SELECT auth.uid() AS uid) = id) OR (my_role() = 'superadmin'::text));
--   alter policy superadmin_delete on public.user_profiles
--     using (my_role() = 'superadmin'::text);
--   alter policy superadmin_insert on public.user_profiles
--     with check (my_role() = 'superadmin'::text);
--   alter policy superadmin_update on public.user_profiles
--     using (my_role() = 'superadmin'::text);
--   alter policy manage_write_vendors on public.vendors
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]))
--     with check (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]));
--   alter policy staff_read_vendors on public.vendors
--     using (my_role() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_activity_log on public.activity_log
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_billing on public.billing
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_insert_boleto_decisions on public.cobranca_handoff_boleto_decisions
  with check ((( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (recorded_by = ( SELECT auth.uid() AS uid)));

alter policy staff_read_cobranca_handoff_boleto_decisions on public.cobranca_handoff_boleto_decisions
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_update_boleto_decisions on public.cobranca_handoff_boleto_decisions
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]))
  with check (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy authorized_insert_cobranca_log on public.cobranca_log
  with check (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]));

alter policy staff_read_cobranca_log on public.cobranca_log
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_conversations on public.conversations
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_insert_crm_image_generations on public.crm_image_generations
  with check ((( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (generated_by = ( SELECT auth.uid() AS uid)));

alter policy staff_read_crm_image_generations on public.crm_image_generations
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_insert_financial_handoff_resolutions on public.financial_handoff_resolutions
  with check ((( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text])) AND (recorded_by = ( SELECT auth.uid() AS uid)));

alter policy staff_read_financial_handoff_resolutions on public.financial_handoff_resolutions
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_followups on public.followups
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_image_generations on public.image_generations
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_leads on public.leads
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_messages on public.messages
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_products_builder_architect on public.products_builder_architect
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_products_consumer on public.products_consumer
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_products_installer on public.products_installer
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_products_reseller on public.products_reseller
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_quotes on public.quotes
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy staff_read_sales on public.sales
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));

alter policy read_own_or_superadmin on public.user_profiles
  using ((( SELECT auth.uid() AS uid) = id) OR (( SELECT public.my_role()) = 'superadmin'::text));

alter policy superadmin_delete on public.user_profiles
  using (( SELECT public.my_role()) = 'superadmin'::text);

alter policy superadmin_insert on public.user_profiles
  with check (( SELECT public.my_role()) = 'superadmin'::text);

alter policy superadmin_update on public.user_profiles
  using (( SELECT public.my_role()) = 'superadmin'::text);

alter policy manage_write_vendors on public.vendors
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]))
  with check (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text]));

alter policy staff_read_vendors on public.vendors
  using (( SELECT public.my_role()) = ANY (ARRAY['superadmin'::text, 'owner'::text, 'manager'::text, 'vendor'::text, 'employee'::text]));
