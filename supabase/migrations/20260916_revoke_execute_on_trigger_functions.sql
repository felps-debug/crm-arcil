-- Advisor: "Public/Signed-In Users Can Execute SECURITY DEFINER Function"
-- (lints 0028 e 0029) em public.set_financial_handoff_followup().
--
-- Funcao de trigger nao precisa de EXECUTE para ninguem: o trigger dispara como
-- dono da tabela e o Postgres nao checa esse privilegio na hora do fire. Isso foi
-- verificado neste projeto antes de escrever a migracao -- um trigger de teste
-- rodou normalmente com has_function_privilege('authenticated', ...) = false.
--
-- A migracao 20260731160547 (revoke_trigger_functions_from_public) ja tinha feito
-- essa limpeza. set_financial_handoff_followup nasceu depois, em 20260811, e pegou
-- os grants padrao de novo. As outras quatro caem no mesmo caso: nao sao SECURITY
-- DEFINER, entao o advisor nao reclama delas, mas o grant e igualmente inutil.

revoke execute on function public.set_financial_handoff_followup() from public, anon, authenticated;
revoke execute on function public.chq_update_updated_at()          from public, anon, authenticated;
revoke execute on function public.set_updated_at()                 from public, anon, authenticated;
revoke execute on function public.update_oos_updated_at()          from public, anon, authenticated;
revoke execute on function public.update_updated_at()              from public, anon, authenticated;

-- ============================================================================
-- my_role() NAO entra aqui, de proposito.
--
-- O advisor tambem aponta public.my_role(), mas revogar quebra o app inteiro:
-- ela e chamada dentro das policies de RLS de varias tabelas (leads, followups,
-- conversations, user_profiles, ...), e uma policy avalia a funcao com o
-- privilegio de quem esta consultando. Testado: com EXECUTE revogado, um SELECT
-- como `authenticated` numa tabela cuja policy chama a funcao falha com
--
--     ERROR: 42501: permission denied for function ...
--
-- ou seja, todo usuario logado perde acesso -- nao "ve menos linhas", recebe erro.
--
-- E o risco que o advisor descreve nao existe neste caso. A funcao e:
--
--     SELECT role::text FROM public.user_profiles WHERE id = auth.uid();
--
-- Devolve o papel do proprio chamador. Para anon, auth.uid() e null e o retorno
-- e null. Nao ha nada a vazar. Falso positivo -- manter como esta.
-- ============================================================================
