# Quickstart de Validação: Otimizar Performance do CRM

Guia pra provar que a feature funciona de ponta a ponta. Detalhes em [contracts/](./contracts/) e [data-model.md](./data-model.md).

## 0. Pré-requisitos

- `npm install` (não `npm ci`, ver AGENTS.md)
- `.env.local` com as variáveis obrigatórias
- Usuário de teste staff **sem** `manage_estoque` e um superadmin. Credenciais em `PERF_USER_EMAIL`/`PERF_USER_PASSWORD` (nunca commitar)
- Acesso ao projeto Vercel `crm-arcil` (escopo `felps-debugs-projects`) pra abrir o preview

## 1. Linha de base (antes de qualquer merge)

```bash
# preview do master atual
PERF_BASE_URL=https://<preview-do-master>.vercel.app npx playwright test --project=perf
```

Esperado: arquivo `perf-results/baseline-<data>.json` com 30 cargas frias e 30 quentes. p50 frio perto de 13 s.

## 2. Gates locais (a cada PR)

```bash
npm run lint -- src e2e scripts   # ou: npx eslint src e2e scripts
npm run typecheck
npm run test                      # inclui os testes de regressão de totais e permissões
npm run build
```

Os testes de regressão (RF-023, CS-005) cobrem:
- `product_metrics` com vazio, `estoque` nulo, mesmo `codigo_erp` em várias tabelas, `codigo_erp` nulo (fallback por linha) e mais de 1.000 linhas.
- `selectAllPages` percorrendo 2.500 linhas simuladas em 3 páginas e lançando erro acima de `MAX_ROWS`.
- Snapshot: role `client` recebe `forbidden` em `activity`/`urgentFollowups`, vendor sem `manage_estoque` recebe `forbidden` em `inventory`, e sem sessão a resposta é 401.
- Store de cache: resposta fora de ordem é descartada, erro mantém o dado anterior e `clearApiCache` roda no logout.
- Mapa do realtime: evento em `conversations` **não** pede `pending`, `inventory` nem `activity`.

## 3. Banco (depois de aplicar as migrações)

```sql
-- mesmos números da contagem atual em JS
select * from public.product_metrics();

-- anon/authenticated não executam a função
set role authenticated; select public.product_metrics();  -- esperado: permission denied
reset role;

-- políticas agora com InitPlan
select tablename, policyname, qual from pg_policies
 where schemaname = 'public' and qual like '%my_role()%' and qual not like '%SELECT my_role()%';
-- esperado: 0 linhas
```

Depois de qualquer DDL: `get_advisors` (security **e** performance) sem alerta novo.

## 4. Aceite no preview (CS-001 a CS-004, CS-008 a CS-010)

```bash
PERF_BASE_URL=https://<preview-da-branch>.vercel.app npx playwright test --project=perf
```

| Critério | Como verificar | Esperado |
|---|---|---|
| CS-001 | JSON de saída, `cold.p50` / `cold.p95` | ≤ 1.500 ms / ≤ 2.000 ms |
| CS-002 | `warm.p95` e ausência de `[data-skeleton="full"]` no retorno | ≤ 300 ms |
| CS-003 | `select max(supabase_requests) from performance_traces where stage='total' and route='/api/dashboard/snapshot' and created_at > <início>` | ≤ 12 |
| CS-004 | Alterar 1 linha de `conversations` pelo SQL editor com o dashboard aberto e contar as requests no DevTools | 1 request `sections=agents,summary` em ≤ 2 s |
| CS-008 | Login, depois trocar de aba 3×, e contar as requests a `user_profiles` | 1 |
| CS-009 | Para 10 `trace_id` da rodada: etapas `browser` e `server` presentes, sem e-mail/telefone | 100% |
| Região | `select distinct region from performance_traces where created_at > <início>` | `gru1` |

Comparar com a linha de base: `node scripts/perf-compare.mjs perf-results/baseline-*.json perf-results/<novo>.json`.

## 5. Fase 2 — sincronizador (depois do merge da Fase 1)

Seguir [contracts/erp-sync-change.md](./contracts/erp-sync-change.md). Rodar o §4 **durante** uma execução do sync para o CS-007.

## Rollback

- Região: reverter `vercel.json`.
- Snapshot: o dashboard volta a usar as 4 rotas antigas, que continuam no ar (reverter o commit da página).
- Migrações: cada uma tem o `down` descrito no cabeçalho (recriar as políticas originais, `drop function product_metrics`, `drop table performance_traces` + `cron.unschedule`).
