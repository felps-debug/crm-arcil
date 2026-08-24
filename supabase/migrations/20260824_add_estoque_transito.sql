-- Depositos 9 ("Transito Hlb Mga", id ERP 61) e 16 ("Transito MS", id ERP 181)
-- nao sao vendaveis agora -- ficam de fora do calculo de `estoque` desde a
-- decisao de 2026-08-17 -- mas sao produto que a ARCIL ja comprou e esta a
-- caminho de HLB Parana (deposito 10) e HLB MS (deposito 14) respectivamente.
-- Guardado a parte para o agente poder dizer "nao tenho agora, mas esta
-- chegando" em vez de tratar como esgotado sem mais informacao.
--
-- Mesma regra de NULL da coluna `estoque`: NULL = "ERP nao reportou nada em
-- transito para este produto", 0 nao existe aqui -- ou tem numero positivo ou
-- e NULL. O workflow n8n "ERP -- SALDO DE ESTOQUE" grava essa coluna junto
-- com `estoque`, mesma resolucao de kit (0103C0/E0/I0).
alter table products_consumer          add column if not exists estoque_transito integer;
alter table products_reseller          add column if not exists estoque_transito integer;
alter table products_installer         add column if not exists estoque_transito integer;
alter table products_builder_architect add column if not exists estoque_transito integer;

comment on column products_consumer.estoque_transito is
  'Saldo somado dos depositos de transito (Transito Hlb Mga -> HLB Parana, Transito MS -> HLB MS), ja com a mesma resolucao de kit do estoque vendavel. NULL = ERP nao reportou nada em transito para este produto.';
comment on column products_reseller.estoque_transito is
  'Saldo somado dos depositos de transito (Transito Hlb Mga -> HLB Parana, Transito MS -> HLB MS), ja com a mesma resolucao de kit do estoque vendavel. NULL = ERP nao reportou nada em transito para este produto.';
comment on column products_installer.estoque_transito is
  'Saldo somado dos depositos de transito (Transito Hlb Mga -> HLB Parana, Transito MS -> HLB MS), ja com a mesma resolucao de kit do estoque vendavel. NULL = ERP nao reportou nada em transito para este produto.';
comment on column products_builder_architect.estoque_transito is
  'Saldo somado dos depositos de transito (Transito Hlb Mga -> HLB Parana, Transito MS -> HLB MS), ja com a mesma resolucao de kit do estoque vendavel. NULL = ERP nao reportou nada em transito para este produto.';
