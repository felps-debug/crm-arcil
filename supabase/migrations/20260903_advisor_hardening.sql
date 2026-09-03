-- Pin search_path on functions the security advisor flagged as mutable
-- (search_path hijacking risk). ALTER FUNCTION ... SET only changes the
-- function's config, not its body/behavior — safe, no-op for callers.
alter function public.add_business_days(date, integer) set search_path = public;
alter function public.busca_preco_consumer(jsonb) set search_path = public;
alter function public.chq_update_updated_at() set search_path = public;
alter function public.disparar_followup_arcil() set search_path = public;
alter function public.disparar_followup_arcil_teste() set search_path = public;
alter function public.disparar_followup_cobranca() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.hybrid_search_any(text, vector, integer, numeric, numeric) set search_path = public;
alter function public.hybrid_search_builder(text, vector, integer, numeric, numeric, text) set search_path = public;
alter function public.hybrid_search_consumer(text, vector, integer, numeric, numeric, text) set search_path = public;
alter function public.hybrid_search_installer(text, vector, integer, numeric, numeric, text) set search_path = public;
alter function public.hybrid_search_reseller(text, vector, integer, numeric, numeric, text) set search_path = public;
alter function public.parse_cobranca_valor(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.update_oos_updated_at() set search_path = public;
alter function public.update_updated_at() set search_path = public;

-- Wrap auth.uid() in a scalar subselect so Postgres evaluates it once per
-- statement instead of once per row (auth_rls_initplan advisor warning).
-- Logic unchanged, just the eval strategy.
alter policy staff_insert_boleto_decisions on public.cobranca_handoff_boleto_decisions
  with check (
    my_role() = ANY (ARRAY['superadmin','owner','manager','vendor','employee'])
    and recorded_by = (select auth.uid())
  );

alter policy staff_insert_financial_handoff_resolutions on public.financial_handoff_resolutions
  with check (
    my_role() = ANY (ARRAY['superadmin','owner','manager','vendor','employee'])
    and recorded_by = (select auth.uid())
  );

alter policy staff_insert_crm_image_generations on public.crm_image_generations
  with check (
    my_role() = ANY (ARRAY['superadmin','owner','manager','vendor','employee'])
    and generated_by = (select auth.uid())
  );

-- Two permissive SELECT policies (superadmin_see_all, users_read_own) were
-- both evaluated on every read of user_profiles (multiple_permissive_policies
-- advisor warning). Merge into one policy with the same OR logic.
drop policy if exists superadmin_see_all on public.user_profiles;
drop policy if exists users_read_own on public.user_profiles;

create policy read_own_or_superadmin on public.user_profiles
  for select
  using ((select auth.uid()) = id or my_role() = 'superadmin');

-- FK columns flagged by the performance advisor without a covering index —
-- cheap to add now while tables are small, avoids seq scans on
-- DELETE/UPDATE cascade checks against leads/cobranca_log/vendors later.
create index if not exists idx_leads_handoff_vendor_id on public.leads (handoff_vendor_id);
create index if not exists idx_financial_handoff_resolutions_lead_id on public.financial_handoff_resolutions (lead_id);
create index if not exists idx_financial_handoff_resolutions_cobranca_log_id on public.financial_handoff_resolutions (cobranca_log_id);
create index if not exists idx_financial_handoff_resolutions_recorded_by on public.financial_handoff_resolutions (recorded_by);
create index if not exists idx_crm_image_generations_lead_id on public.crm_image_generations (lead_id);
create index if not exists idx_crm_image_generations_generated_by on public.crm_image_generations (generated_by);
create index if not exists idx_cobranca_handoff_boleto_decisions_recorded_by on public.cobranca_handoff_boleto_decisions (recorded_by);

-- PDF bucket write policies only required `authenticated`, so any logged-in
-- CRM user (regardless of the manage_gerador_imagem permission the feature
-- is gated on everywhere else) could insert/update objects there. In
-- practice all real writes go through generate-image/route.ts using the
-- admin client (bypasses RLS), so this only tightens the belt-and-suspenders
-- policy — no behavior change for the actual feature.
drop policy if exists pdf_insert on storage.objects;
drop policy if exists pdf_update on storage.objects;

create policy pdf_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'PDF'
    and (
      my_role() = any (array['superadmin','owner'])
      or coalesce(
        (select (up.permissions->>'manage_gerador_imagem')::boolean
         from public.user_profiles up
         where up.id = (select auth.uid())),
        false
      )
    )
  );

create policy pdf_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'PDF')
  with check (
    bucket_id = 'PDF'
    and (
      my_role() = any (array['superadmin','owner'])
      or coalesce(
        (select (up.permissions->>'manage_gerador_imagem')::boolean
         from public.user_profiles up
         where up.id = (select auth.uid())),
        false
      )
    )
  );
