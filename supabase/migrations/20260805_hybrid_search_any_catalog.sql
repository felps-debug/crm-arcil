-- Busca nos 4 catálogos de uma vez e devolve de qual catálogo veio cada linha.
--
-- Para o caso "lead chega perguntando direto, sem ter sido identificado".
-- Antes o roteador tinha que adivinhar o AGENT_TYPE ANTES de buscar; errando,
-- caía no catálogo errado e voltava lixo — foi a execução 96516, em que uma
-- lista de materiais de instalação foi buscada em products_consumer, que não
-- tem um único tubo de cobre, coxim, canaleta ou cabo PP (0 de 886 linhas).
--
-- Aqui a ordem se inverte: busca primeiro, e o catálogo de onde vieram os
-- melhores resultados diz qual é o segmento. O roteador grava esse segmento e
-- passa a usar a função específica dali em diante.
--
-- SCORE: não dá para usar RRF aqui. RRF ranqueia DENTRO de cada catálogo, então
-- o 1º lugar do consumer e o 1º do installer recebem exatamente o mesmo valor —
-- na primeira versão os 4 catálogos empataram em 0.01961. Similaridade de
-- cosseno é comparável entre tabelas (mesmo modelo de embedding nas 4), com
-- bônus fixo de 0.05 quando o full-text também bate.
--
-- `marca` sai de metadata->>'marca' em installer e builder, que não têm a coluna.

create or replace function public.hybrid_search_any(
  query_text text,
  query_embedding vector,
  match_count integer default 10,
  p_min_price numeric default null,
  p_max_price numeric default null
)
returns table (
  catalogo text,
  id uuid,
  codigo_erp text,
  nome text,
  marca text,
  preco_venda numeric,
  content text,
  score double precision
)
language sql
as $$
with
consumer as (
  select 'CONSUMER'::text as catalogo, p.id, p.codigo_erp, p.nome, p.marca, p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end as score
  from public.products_consumer p
  where (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
installer as (
  select 'INSTALLER'::text, p.id, p.codigo_erp, p.nome, p.metadata->>'marca', p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_installer p
  where (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
reseller as (
  select 'RESELLER'::text, p.id, p.codigo_erp, p.nome, p.marca, p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_reseller p
  where (p_min_price is null or p.preco_venda >= p_min_price)
    and (p_max_price is null or p_max_price <= 0 or p.preco_venda <= p_max_price)
  order by p.embedding <=> query_embedding
  limit 50
),
builder as (
  select 'BUILDER'::text, p.id, p.codigo_erp, p.nome, p.metadata->>'marca', p.preco_venda, p.content,
         (1 - (p.embedding <=> query_embedding))
           + case when websearch_to_tsquery('portuguese', query_text) @@ p.fts then 0.05 else 0 end
  from public.products_builder_architect p
  where (p_min_price is null or p.preco_venda >= p_min_price)
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
$$;
