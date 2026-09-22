-- Numeros do catalogo numa consulta so.
--
-- O dashboard contava produto paginando `codigo_erp` das tabelas products_*
-- em serie: ate dez idas ao banco por carga, cada uma com ~1,3 s de media
-- (pg_stat_statements, 2026-09-22) porque disputava com o sync do ERP. E tres
-- lugares tinham tres regras quase iguais para o mesmo numero.
--
-- Regra (espelhada em src/lib/server/product-metrics.ts, onde estao os testes):
--   produto = codigo_erp; linha sem codigo conta sozinha ('linha:<tabela>:<id>')
--   saldo   = max(estoque) entre os segmentos do mesmo produto
--   nulo    = "nao sincronizado", nunca zero
--
-- products_builder_architect entra com o estoque dela. O codigo antigo a
-- deixava de fora dizendo que a tabela nao tinha a coluna -- ela tem, e 30 dos
-- 31 produtos dali tem saldo, nenhum repetido nas outras tabelas.
--
-- Privilegio: so o service role executa. O CRM chama pelo admin client, depois
-- de verificar o usuario na rota; anon/authenticated nao tem por que contar o
-- catalogo direto pelo PostgREST.
--
-- down:
--   drop function if exists public.product_metrics();

create or replace function public.product_metrics()
returns table (
  total_distintos       integer,
  com_estoque_conhecido integer,
  disponiveis           integer,
  zerados               integer,
  estoque_baixo         integer,
  sincronizado          boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with linhas as (
    select coalesce(codigo_erp, 'linha:products_consumer:' || id::text) as chave, estoque
      from public.products_consumer
    union all
    select coalesce(codigo_erp, 'linha:products_reseller:' || id::text), estoque
      from public.products_reseller
    union all
    select coalesce(codigo_erp, 'linha:products_installer:' || id::text), estoque
      from public.products_installer
    union all
    select coalesce(codigo_erp, 'linha:products_builder_architect:' || id::text), estoque
      from public.products_builder_architect
  ),
  produtos as (
    select chave, max(estoque) as estoque
      from linhas
     group by chave
  )
  select
    count(*)::integer,
    count(estoque)::integer,
    (count(*) filter (where estoque > 0))::integer,
    (count(*) filter (where estoque <= 0))::integer,
    (count(*) filter (where estoque between 1 and 10))::integer,
    count(estoque) > 0
  from produtos;
$$;

revoke execute on function public.product_metrics() from public, anon, authenticated;
grant execute on function public.product_metrics() to service_role;

comment on function public.product_metrics() is
  'Totais do catalogo por produto (codigo_erp), usados pelo dashboard, pendencias e Demanda & Estoque. Regra espelhada e testada em src/lib/server/product-metrics.ts.';
