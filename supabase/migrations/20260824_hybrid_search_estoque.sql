-- hybrid_search_* tirou `estoque` da resposta em 2026-08-05 porque na epoca
-- estava 100% nulo em toda tabela (a sincronizacao real so passou a existir
-- em 2026-08-17). Ninguem voltou a adicionar depois -- o agente de vendas
-- respondia sobre estoque sem nunca ter visto o numero.
--
-- Junto entra `estoque_transito` (adicionada agora, ver
-- 20260824_add_estoque_transito.sql): produto que a ARCIL ja comprou e esta a
-- caminho de HLB Parana/HLB MS, mas ainda nao vendavel. Sem essa coluna o
-- agente so enxerga "zerado" e nao tem como dizer "chegando".
--
-- Assinatura e o resto da logica (RRF, kit de split, price filter) ficam
-- identicos a 20260805_hybrid_search_slim_payload.sql -- so a lista de
-- colunas devolvidas muda.

drop function if exists public.hybrid_search_consumer(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_installer(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_reseller(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_builder(text, vector, integer, numeric, numeric, text);


create function public.hybrid_search_consumer(
  query_text text, query_embedding vector, match_count integer default 5,
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance'
)
returns table (id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
language plpgsql
as $$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_consumer p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_consumer p
    where (p_min_price is null or p.preco_venda >= p_min_price)
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
$$;


create function public.hybrid_search_installer(
  query_text text, query_embedding vector, match_count integer default 5,
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance'
)
returns table (id uuid, codigo_erp text, nome text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
language plpgsql
as $$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_installer p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_installer p
    where (p_min_price is null or p.preco_venda >= p_min_price)
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
$$;


create function public.hybrid_search_reseller(
  query_text text, query_embedding vector, match_count integer default 5,
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance'
)
returns table (id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, estoque integer, estoque_transito integer, content text, metadata jsonb)
language plpgsql
as $$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_reseller p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_reseller p
    where (p_min_price is null or p.preco_venda >= p_min_price)
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
$$;


create function public.hybrid_search_builder(
  query_text text, query_embedding vector, match_count integer default 5,
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance'
)
returns table (id uuid, codigo_erp text, nome text, preco_venda numeric, estoque integer, estoque_transito integer, specs_json jsonb, content text, metadata jsonb)
language plpgsql
as $$
begin
  return query
  with keyword_search as (
    select p.id,
           rank() over (order by ts_rank_cd(p.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_kw
    from public.products_builder_architect p
    where websearch_to_tsquery('portuguese', query_text) @@ p.fts
      and (p_min_price is null or p.preco_venda >= p_min_price)
      and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
    order by rank_kw
    limit 50
  ),
  semantic_search as (
    select p.id,
           rank() over (order by p.embedding <=> query_embedding) as rank_vec
    from public.products_builder_architect p
    where (p_min_price is null or p.preco_venda >= p_min_price)
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
$$;
