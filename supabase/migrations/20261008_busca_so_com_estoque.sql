-- A busca de produto dos agentes de IA só devolve o que tem saldo para vender.
--
-- Antes as RPCs hybrid_search_* ignoravam o estoque: um produto com saldo 0
-- rankeava igual a um com 25 unidades, e o top 10 enchia de itens zerados. Caso
-- real (30/09/2026): para "60 mil BTUs" a Renata ofereceu Hisense, Elgin e
-- Hitachi — todos com estoque 0 — e não ofereceu os três Philco 60.000 que
-- tinham saldo.
--
-- Regra do negócio: NUNCA oferecer produto sem estoque. `estoque > 0` entra nos
-- DOIS ramos de cada busca (palavra-chave e semântico), antes do ranking, então
-- o limite de 50 candidatos por ramo já é só de itens vendáveis. `estoque` nulo
-- (o ERP não mandou saldo) também fica de fora: sem saldo conhecido não dá para
-- prometer. `estoque_transito` NÃO conta como disponível — o agente não oferece
-- o que ainda não chegou; o pedido sem resultado vira linha em
-- out_of_stock_requests (sinal de demanda), como o prompt já manda.
--
-- Assinaturas e colunas de retorno idênticas às anteriores: o n8n e a edge
-- function hybrid-search não mudam.

create or replace function public.hybrid_search_consumer(query_text text, query_embedding vector, match_count integer default 5, p_min_price numeric default null::numeric, p_max_price numeric default null::numeric, p_sort text default 'relevance'::text)
 returns table(id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
 language plpgsql
 set search_path to 'public'
as $function$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_consumer p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_consumer p
    where p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_vec
    limit 50
  )
  select a.id, a.codigo_erp, a.nome, a.marca, a.preco_venda, a.estoque, a.estoque_transito, a.content, a.metadata
  from public.products_consumer a
  join (
    select coalesce(k.id, s.id) as id,
           coalesce(1.0 / (50 + k.rank_kw), 0.0) + coalesce(1.0 / (50 + s.rank_vec), 0.0) as rrf_score
    from keyword_search k full outer join semantic_search s on k.id = s.id
  ) combined on a.id = combined.id
  order by
    case when p_sort = 'cheapest'  then a.preco_venda end asc  nulls last,
    case when p_sort = 'expensive' then a.preco_venda end desc nulls last,
    combined.rrf_score desc
  limit match_count;
end;
$function$;

create or replace function public.hybrid_search_reseller(query_text text, query_embedding vector, match_count integer default 5, p_min_price numeric default null::numeric, p_max_price numeric default null::numeric, p_sort text default 'relevance'::text)
 returns table(id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
 language plpgsql
 set search_path to 'public'
as $function$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_reseller p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_reseller p
    where p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_vec
    limit 50
  )
  select a.id, a.codigo_erp, a.nome, a.marca, a.preco_venda, a.estoque, a.estoque_transito, a.content, a.metadata
  from public.products_reseller a
  join (
    select coalesce(k.id, s.id) as id,
           coalesce(1.0 / (50 + k.rank_kw), 0.0) + coalesce(1.0 / (50 + s.rank_vec), 0.0) as rrf_score
    from keyword_search k full outer join semantic_search s on k.id = s.id
  ) combined on a.id = combined.id
  order by
    case when p_sort = 'cheapest'  then a.preco_venda end asc  nulls last,
    case when p_sort = 'expensive' then a.preco_venda end desc nulls last,
    combined.rrf_score desc
  limit match_count;
end;
$function$;

create or replace function public.hybrid_search_installer(query_text text, query_embedding vector, match_count integer default 5, p_min_price numeric default null::numeric, p_max_price numeric default null::numeric, p_sort text default 'relevance'::text)
 returns table(id uuid, codigo_erp text, nome text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
 language plpgsql
 set search_path to 'public'
as $function$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_installer p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_installer p
    where p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_vec
    limit 50
  )
  select a.id, a.codigo_erp, a.nome, a.preco_venda, a.estoque, a.estoque_transito, a.content, a.metadata
  from public.products_installer a
  join (
    select coalesce(k.id, s.id) as id,
           coalesce(1.0 / (50 + k.rank_kw), 0.0) + coalesce(1.0 / (50 + s.rank_vec), 0.0) as rrf_score
    from keyword_search k full outer join semantic_search s on k.id = s.id
  ) combined on a.id = combined.id
  order by
    case when p_sort = 'cheapest'  then a.preco_venda end asc  nulls last,
    case when p_sort = 'expensive' then a.preco_venda end desc nulls last,
    combined.rrf_score desc
  limit match_count;
end;
$function$;

create or replace function public.hybrid_search_builder(query_text text, query_embedding vector, match_count integer default 5, p_min_price numeric default null::numeric, p_max_price numeric default null::numeric, p_sort text default 'relevance'::text)
 returns table(id uuid, codigo_erp text, nome text, preco_venda numeric, estoque integer, estoque_transito integer, specs_json jsonb, content text, metadata jsonb)
 language plpgsql
 set search_path to 'public'
as $function$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_builder_architect p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_builder_architect p
    where p.estoque > 0
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_vec
    limit 50
  )
  select a.id, a.codigo_erp, a.nome, a.preco_venda, a.estoque, a.estoque_transito, a.specs_json, a.content, a.metadata
  from public.products_builder_architect a
  join (
    select coalesce(k.id, s.id) as id,
           coalesce(1.0 / (50 + k.rank_kw), 0.0) + coalesce(1.0 / (50 + s.rank_vec), 0.0) as rrf_score
    from keyword_search k full outer join semantic_search s on k.id = s.id
  ) combined on a.id = combined.id
  order by
    case when p_sort = 'cheapest'  then a.preco_venda end asc  nulls last,
    case when p_sort = 'expensive' then a.preco_venda end desc nulls last,
    combined.rrf_score desc
  limit match_count;
end;
$function$;

-- Busca sem segmento conhecido (agent_type ausente/errado): mesma regra.
create or replace function public.hybrid_search_any(query_text text, query_embedding vector, match_count integer default 10, p_min_price numeric default null::numeric, p_max_price numeric default null::numeric)
 returns table(catalogo text, id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, content text, score double precision)
 language sql
 set search_path to 'public'
as $function$
with
consumer as (
  select 'CONSUMER'::text as catalogo, p.id, p.codigo_erp, p.nome, p.marca, p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end as score
  from public.products_consumer p
  where p.estoque > 0
    and (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
installer as (
  select 'INSTALLER'::text, p.id, p.codigo_erp, p.nome, p.metadata->>'marca', p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_installer p
  where p.estoque > 0
    and (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
reseller as (
  select 'RESELLER'::text, p.id, p.codigo_erp, p.nome, p.marca, p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_reseller p
  where p.estoque > 0
    and (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
builder as (
  select 'BUILDER'::text, p.id, p.codigo_erp, p.nome, p.metadata->>'marca', p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_builder_architect p
  where p.estoque > 0
    and (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
)
select * from (
  select * from consumer
  union all select * from installer
  union all select * from reseller
  union all select * from builder
) todos
order by score desc
limit match_count;
$function$;
