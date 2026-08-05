-- ============================================================================
-- hybrid_search_* — dois bugs, uma migration.
-- ============================================================================
--
-- BUG 1 — estouro de janela de contexto no n8n
-- ("Your input exceeds the context window of this model", estimatedTokens 875.952)
--
-- As funções declaravam RETURNS SETOF products_<segmento> e faziam SELECT a.*,
-- ou seja devolviam TODAS as colunas — inclusive `embedding` (vector(1536)).
-- Medido em products_installer:
--
--   linha inteira em JSON ... 19.763 chars
--   só o embedding ......... 19.275 chars  (97,5%)
--   resto (dados úteis) ....    ~488 chars
--
-- Com match_count = 10 (default da edge function hybrid-search) cada chamada da
-- tool BUSCA_RAG devolvia ~198 KB ≈ 50k tokens de ruído.
--
-- BUG 2 — o lado semântico retornava candidatos quase aleatórios
--
-- Nos dois CTEs o `limit 50` rodava SEM `order by`. Postgres avalia a window
-- function antes do LIMIT, mas sem ORDER BY no nível externo o LIMIT corta 50
-- linhas em ordem de scan, não as 50 melhores. Buscar "split 9000 frio" trazia
-- PAINEL CASSETE / COMPRESSOR EMBRACO / VALVULA EXPANSÃO. O agente então
-- refazia a busca, e cada tentativa somava contexto — realimentando o bug 1.
-- O ORDER BY explícito também permite usar o índice vetorial.
--
-- COLUNAS RETORNADAS
--
-- Mantém `content` (texto do RAG) e `metadata` (jsonb com id_erp/nome/marca/
-- grupo/preco, ~150 chars). Remove:
--   • embedding, fts        → ruído puro
--   • estoque               → null em 100% das linhas (0/886, 0/1394, 0/759)
--   • categoria (installer) → null em 100% das linhas
--   • btu, voltagem (consumer) → null em 100% das linhas
-- `marca` sobe como coluna própria onde existe (consumer, reseller).
--
-- Também derruba a sobrecarga antiga (full_text_weight/semantic_weight/rrf_k),
-- que ficara duplicada em cima de cada função.
-- ============================================================================

drop function if exists public.hybrid_search_consumer(text, vector, integer, double precision, double precision, integer);
drop function if exists public.hybrid_search_installer(text, vector, integer, double precision, double precision, integer);
drop function if exists public.hybrid_search_reseller(text, vector, integer, double precision, double precision, integer);
drop function if exists public.hybrid_search_builder(text, vector, integer, double precision, double precision, integer);

drop function if exists public.hybrid_search_consumer(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_installer(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_reseller(text, vector, integer, numeric, numeric, text);
drop function if exists public.hybrid_search_builder(text, vector, integer, numeric, numeric, text);


create function public.hybrid_search_consumer(
  query_text text, query_embedding vector, match_count integer default 5,
  p_min_price numeric default null, p_max_price numeric default null,
  p_sort text default 'relevance'
)
returns table (id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, content text, metadata jsonb)
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
  select a.id, a.codigo_erp, a.nome, a.marca, a.preco_venda, a.content, a.metadata
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
returns table (id uuid, codigo_erp text, nome text, preco_venda numeric, content text, metadata jsonb)
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
  select a.id, a.codigo_erp, a.nome, a.preco_venda, a.content, a.metadata
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
returns table (id uuid, codigo_erp text, nome text, marca text, preco_venda numeric, content text, metadata jsonb)
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
  select a.id, a.codigo_erp, a.nome, a.marca, a.preco_venda, a.content, a.metadata
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
returns table (id uuid, codigo_erp text, nome text, preco_venda numeric, specs_json jsonb, content text, metadata jsonb)
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
  select a.id, a.codigo_erp, a.nome, a.preco_venda, a.specs_json, a.content, a.metadata
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
