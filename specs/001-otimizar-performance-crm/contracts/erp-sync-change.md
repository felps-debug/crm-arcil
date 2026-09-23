# Contrato: Mudança no Sincronizador ERP (Fase 2, fora deste repo)

**Workflow**: n8n "ERP — SALDO DE ESTOQUE" (roda de hora em hora; lê saldo do NetOne)
**Responsável**: não formalizado. Mudança aplicada via API do n8n em 2026-09-23 03:58 UTC, a pedido do dono do repositório.
**Não bloqueia** o merge da Fase 1 (clarificação Q4).

## Mudança exigida (RF-016)

Nos `UPDATE products_{consumer,reseller,installer,builder_architect} p SET estoque = v.qtd FROM (VALUES …) v(codigo, qtd) WHERE p.codigo_erp = v.codigo`:

```sql
  AND p.estoque IS DISTINCT FROM v.qtd
```

E o mesmo nos `UPDATE … SET estoque_transito = v.qtd`:

```sql
  AND p.estoque_transito IS DISTINCT FROM v.qtd
```

`IS DISTINCT FROM` trata `NULL → 5`, `5 → NULL` e `5 → 6` como mudança, e `NULL → NULL` e `5 → 5` como igual. É exatamente o que o edge case da spec pede.

**Upsert de catálogo** (PostgREST `UPDATE products_installer SET content, embedding, …`): só regenerar embedding e mandar a linha quando `nome` ou `content` mudarem em relação ao que está gravado. Comparar pelo hash de `content` no n8n antes de chamar a API.

## Aplicado em 2026-09-23

- Workflow `krRXPmBmuEOkRXRi` ("ERP — SALDO DE ESTOQUE"), nó **MONTA SQL**. Backup do estado anterior em `docs/backups/n8n/erp-saldo-estoque-2026-09-23.json` (fora do git).
- Os quatro UPDATEs por tabela ganharam o filtro de "só se mudou":
  - `SET estoque = v.qtd ... AND p.estoque IS DISTINCT FROM v.qtd`
  - `SET estoque = NULL WHERE p.estoque IS NOT NULL AND ...` (antes regravava NULL sobre NULL)
  - os mesmos dois para `estoque_transito`
- O `sku` já tinha `IS DISTINCT FROM`.
- **Upsert de catálogo** (workflow "ERP INTEGRAÇÃO", `IJ5BbOBcRMDF8Fjr`): o ramo agendado já compara nome/marca/grupo/preço com o banco antes de gravar e gerar embedding. Não foi alterado.
- Linha de base de `n_tup_upd` antes da mudança: consumer 1.435.704 · installer 1.435.786 · reseller 2.427.895 · builder_architect 48.917.

## Procedimento

1. **Recarregar** a aba do editor do n8n antes de editar (armadilha do AGENTS.md: salvar pelo editor sobrescreve mudanças feitas via API).
2. Exportar o JSON do workflow atual pra `docs/backups/n8n/erp-saldo-estoque-<data>.json`.
3. Anotar a linha de base: `select relname, n_tup_upd from pg_stat_user_tables where relname like 'products_%';`
4. Aplicar a mudança e salvar.
5. Esperar 2 execuções.

## Validação (CS-006, CS-007)

- `n_tup_upd` cresce **no máximo** o número de produtos cujo saldo mudou de verdade entre duas execuções. Conferir contra o ERP ou pelo log do n8n, que deve registrar `rowCount` por UPDATE.
- Lote idêntico → `rowCount = 0` em todos os UPDATEs.
- Durante uma execução, rodar a medição do dashboard ([quickstart.md](../quickstart.md) §4). O p95 tem que ficar ≤ 2 s.

## Rollback

Reimportar o JSON salvo no passo 2.
