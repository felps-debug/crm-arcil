-- Colunas que a sincronizacao do ERP precisa para gravar o que ja busca.
--
-- Contexto: o workflow n8n "ERP — SALDO DE ESTOQUE" le o catalogo e o saldo do
-- NetOne de hora em hora. Tres campos que ele ja tem em maos nao tinham onde
-- cair, e por isso o CRM mostrava numero errado ou nada:
--
--   1. `imagem_url`   — o ERP entrega a foto oficial de 637 dos 925 produtos de
--                       ar condicionado. Sem coluna, o Gerador de Imagem
--                       inventava um aparelho generico e a tela de catalogo
--                       ficava sem miniatura.
--   2. `preco_revenda` — a ARCIL tem duas tabelas de preco (VAREJO AR e
--                       REVENDA 2026). O CRM so guardava uma, entao o agente de
--                       revenda e de construtor/arquiteto cotava preco de
--                       varejo. O percentual varia por produto, entao nao da
--                       para derivar do varejo.
--   3. `estoque`      — products_builder_architect era a unica tabela de produto
--                       sem essa coluna, o que escondia 13 produtos VRF Springer
--                       Midea que tinham saldo real no ERP.
--   4. `sku`          — a mascara do produto (0129C1). O CRM so guardava
--                       codigo_erp, que e o idProduto (13261) — numero interno
--                       que ninguem digita. Na tela do ERP o vendedor ve a
--                       mascara, entao buscar por ela nao achava nada.
--
-- Todas as colunas sao anulaveis de proposito: NULL significa "o ERP nao
-- reportou", que e diferente de zero. A tela distingue os dois casos, e tratar
-- ausencia como zero ja produziu 59 produtos marcados como "Critico" sem que
-- ninguem tivesse medido o estoque deles.

alter table products_consumer          add column if not exists imagem_url text;
alter table products_reseller          add column if not exists imagem_url text;
alter table products_installer         add column if not exists imagem_url text;
alter table products_builder_architect add column if not exists imagem_url text;

comment on column products_consumer.imagem_url is
  'URL da foto oficial do produto no ERP (CloudFront assinado). Preenchida pelo workflow n8n a partir de produto/reduzidos.';
comment on column products_reseller.imagem_url is
  'URL da foto oficial do produto no ERP (CloudFront assinado). Preenchida pelo workflow n8n a partir de produto/reduzidos.';
comment on column products_installer.imagem_url is
  'URL da foto oficial do produto no ERP (CloudFront assinado). Preenchida pelo workflow n8n a partir de produto/reduzidos.';
comment on column products_builder_architect.imagem_url is
  'URL da foto oficial do produto no ERP (CloudFront assinado). Preenchida pelo workflow n8n a partir de produto/reduzidos.';

alter table products_consumer          add column if not exists sku text;
alter table products_reseller          add column if not exists sku text;
alter table products_installer         add column if not exists sku text;
alter table products_builder_architect add column if not exists sku text;

-- Indice para a busca do seletor de produto do gerador de imagem, que casa por
-- prefixo: quem digita "0129" espera a familia toda.
create index if not exists products_consumer_sku_idx          on products_consumer (sku);
create index if not exists products_reseller_sku_idx          on products_reseller (sku);
create index if not exists products_installer_sku_idx         on products_installer (sku);
create index if not exists products_builder_architect_sku_idx on products_builder_architect (sku);

comment on column products_consumer.sku is
  'Mascara do produto no ERP (ex: 0129C1) — o codigo que aparece na tela do NetOne e que o vendedor digita. Diferente de codigo_erp, que e o idProduto numerico.';

-- Preco de revenda so nos canais que vendem com CNPJ. Consumidor final e
-- instalador seguem no varejo de `preco_venda`.
alter table products_reseller          add column if not exists preco_revenda numeric;
alter table products_builder_architect add column if not exists preco_revenda numeric;

comment on column products_reseller.preco_revenda is
  'Preco da tabela REVENDA 2026 do ERP (campo valorAtacado de produto/precos). NULL enquanto o vendedor da API nao tiver essa tabela vinculada no cadastro — nesse caso o agente deve cair para preco_venda.';
comment on column products_builder_architect.preco_revenda is
  'Preco da tabela REVENDA 2026 do ERP (campo valorAtacado de produto/precos). NULL enquanto o vendedor da API nao tiver essa tabela vinculada no cadastro — nesse caso o agente deve cair para preco_venda.';

alter table products_builder_architect add column if not exists estoque integer;

comment on column products_builder_architect.estoque is
  'Saldo somado dos depositos de venda (HLB MS, HLB Parana, LONDRINA PDV), ja liquido de reservas. Para kits de split o valor e calculado: max(saldo do kit, min(unidade externa, unidade interna)), porque o ERP guarda o saldo fisico nas duas metades e deixa o kit zerado.';

-- A tabela `product_reference_images` continua sendo curadoria manual e tem
-- precedencia sobre `imagem_url`: e onde entra uma foto melhor que a do ERP, ou
-- uma foto para um produto que o ERP nao fotografou. A sincronizacao horaria
-- nunca escreve nela, entao o que for curado ali sobrevive.
