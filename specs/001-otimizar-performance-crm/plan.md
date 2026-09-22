# Implementation Plan: Otimizar Performance do CRM

**Branch**: `001-otimizar-performance-crm` (a criar a partir de `master`) | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-otimizar-performance-crm/spec.md`

## Summary

Levar a abertura do dashboard de ~13 s pra p95 ≤ 2 s e deixar a navegação de volta instantânea, sem mudar números nem permissões. A abordagem técnica (detalhada em [research.md](./research.md)):

1. **Aproximar a execução dos dados**: funções da Vercel em `gru1`, porque o banco está em `sa-east-1`.
2. **Uma carga, uma autenticação**: `GET /api/dashboard/snapshot` verifica a identidade uma vez com `getClaims()` (ES256, local), lê o perfil uma vez e monta as seções a partir de uma única leitura central.
3. **Agregar no banco**: `product_metrics()` substitui ~10 queries paginadas de produto por uma.
4. **Reaproveitar no cliente**: `useApi` com stale-while-revalidate em memória (30 s) e proteção contra resposta fora de ordem.
5. **Realtime seletivo**: invalidar só as seções da tabela que mudou, em janelas de 2 s.
6. **Menos trabalho repetido**: perfil carregado uma vez, contagem urgente compartilhada, RLS com `(select my_role())`, projeções e paginação completas.
7. **Medir**: `performance_traces` + `Server-Timing` + script Playwright de aceite.
8. **Fase 2 (fora do repo)**: sincronizador n8n só grava o que mudou.

## Technical Context

**Language/Version**: TypeScript 5, Node.js 20 (runtime Vercel), SQL (PostgreSQL 17.6)

**Primary Dependencies**: Next.js 16.2.1 (App Router, `cacheComponents: true`), React 19.2, `@supabase/ssr` 0.9, `@supabase/supabase-js` 2.100 (`auth.getClaims`), `@sentry/nextjs` (sem mudança). **Nenhuma dependência nova.**

**Storage**: Supabase Postgres `swcqvrowqwylcegrcesu` (`sa-east-1`). Mudanças: tabela nova `performance_traces`, função nova `product_metrics()`, políticas RLS recriadas e um job `pg_cron`.

**Testing**: Vitest (`src/**/*.test.ts`, ambiente node) para agregações, paginação, autorização por seção, store de cache e mapa do realtime. Playwright, projeto novo `perf`, para o aceite. SQL de verificação no quickstart.

**Target Platform**: Vercel (projeto `crm-arcil`, região `gru1`), navegadores desktop e mobile dos operadores no Brasil.

**Project Type**: aplicação web full-stack (Next.js App Router com API routes).

**Performance Goals**: carga fria do dashboard p50 ≤ 1,5 s e p95 ≤ 2 s (CS-001). Retorno p95 ≤ 300 ms (CS-002). ≤ 12 leituras por carga fria (CS-003). ≤ 1 revalidação por seção afetada (CS-004).

**Constraints**: permissões e números visíveis idênticos aos atuais (exceto correções de truncamento). Sem Redis, sem upgrade do banco, sem otimização de bundle (RF-024). Cache só em memória da aba. Nenhum dado pessoal nos traços.

**Scale/Scope**: 2 usuários ativos hoje (`user_profiles`), ~100 linhas nas tabelas centrais, 3.315 linhas de produto (~1.890 produtos distintos). O desenho precisa aguentar mais de 1.000 linhas por tabela sem truncar.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` ainda é o **template sem ratificar**, então não existem princípios formais. Como gates, uso as regras obrigatórias do `AGENTS.md`:

| Gate (AGENTS.md) | Pré-pesquisa | Pós-design |
|---|---|---|
| Duas camadas de acesso: rota nova com `requireApiUser`/`requireApiPermission` | ✅ planejado | ✅ Snapshot com auth na rota **e** regra por seção. `inventory` preserva `manage_estoque`. `activity`/`urgentFollowups` reaplicam a regra de staff da RLS ([contracts/dashboard-snapshot.md](./contracts/dashboard-snapshot.md)). `/api/perf/traces` com `requireApiUser` |
| Mudança de schema só por migração nova em `supabase/migrations/` | ✅ | ✅ 3 migrações novas, nenhuma editada |
| `get_advisors` depois de DDL | ✅ | ✅ no quickstart §3 |
| Env var só via `src/lib/env.ts` | ✅ | ✅ `PERF_*` só no script de teste. `VERCEL_REGION`/`VERCEL_GIT_COMMIT_SHA` entram em `env.ts` |
| `createAdminClient` só em API routes | ✅ | ✅ `product_metrics` e os traços só são chamados no servidor |
| Tela nova usa o console shell | N/A (nenhuma tela nova) | N/A |
| Realtime com debounce | ✅ | ✅ 2 s por seção (a regra atual é de 500 ms, e a spec pede 2–5 s) |
| `use-current-user` não seta `loading` em refresh de token | ✅ | ✅ D9 mantém isso e ainda remove o reload do perfil |
| Divisão Gemini/vetor, n8n do gerador | N/A | N/A |

**Resultado**: nenhum gate violado. Recomendação à parte: ratificar a constituição com `/speckit-constitution`, porque sem ela os próximos planos também não têm gate formal.

## Project Structure

### Documentation (this feature)

```text
specs/001-otimizar-performance-crm/
├── plan.md              # este arquivo
├── research.md          # Fase 0: fatos medidos + decisões D1–D13
├── data-model.md        # Fase 1: performance_traces, product_metrics, estados em memória
├── quickstart.md        # Fase 1: validação local, banco e aceite no preview
├── contracts/
│   ├── dashboard-snapshot.md
│   ├── realtime-invalidation.md
│   ├── performance-traces.md
│   └── erp-sync-change.md     # Fase 2, fora do repo
├── checklists/requirements.md
└── tasks.md             # Fase 2 do spec-kit (/speckit-tasks), ainda não criado
```

### Source Code (repository root)

```text
vercel.json                                   # NOVO: regions ["gru1"]
src/
  proxy.ts                                    # getSession → getClaims; rate limit de /api/perf/traces
  lib/
    env.ts                                    # + VERCEL_REGION, VERCEL_GIT_COMMIT_SHA
    client-api.ts                             # useApi com store SWR em memória, invalidate, clearApiCache
    realtime-sections.ts                      # NOVO: mapa origem→seções + batcher de 2 s
    perf/
      trace-client.ts                         # NOVO: traceId, marcas do browser, sendBeacon
      trace-server.ts                         # NOVO: AsyncLocalStorage, cronômetro de etapas, Server-Timing, gravação com after()
    supabase/
      fetch-with-timeout.ts                   # + contador de requests por trace
      queries.ts                              # getUrgentFollowupsCount/getRecentActivity saem do uso direto
    server/
      api-auth.ts                             # resolveApiContext() com getClaims; requireApiUser({ strict }) com getUser
      crm-data.ts                             # seções puras; coreTables com projeção + selectAllPages; product_metrics
      select-all-pages.ts                     # NOVO: paginação completa com teto
      dashboard-snapshot.ts                   # NOVO: orquestra as seções com allSettled
  hooks/
    use-current-user.tsx                      # só onAuthStateChange, reload só se o id mudar
    use-supabase.ts                           # passa a usar o mesmo store (chave explícita)
    use-urgent-followups.tsx                  # NOVO: provider + hook
  components/layout/
    providers.tsx                             # + UrgentFollowupsProvider
    sidebar.tsx                               # lê a contagem do contexto
  app/
    page.tsx                                  # uma chamada ao snapshot, realtime por seção, data-dashboard-ready
    leads/page.tsx, cobranca/page.tsx         # invalidate() + janela de 2 s
    api/dashboard/snapshot/route.ts           # NOVO
    api/perf/traces/route.ts                  # NOVO
    api/dashboard/summary|pending-center/, api/agents/summary/, api/inventory/summary/
                                              # delegam às funções de seção (mesmo contrato)
supabase/migrations/
  20260923_rls_initplan_my_role.sql           # NOVO: políticas com (select my_role())
  20260923_product_metrics.sql                # NOVO: função + grants
  20260923_performance_traces.sql             # NOVO: tabela + RLS + pg_cron
e2e/perf/dashboard.perf.ts                    # NOVO: 30 frias + 30 quentes, saída JSON
playwright.config.ts                          # + projeto "perf" fora do run padrão
scripts/perf-compare.mjs                      # NOVO: compara baseline × candidato
AGENTS.md                                     # corrigir a seção Estoque (estoque já vem preenchido), documentar a região e o snapshot
```

**Structure Decision**: aplicação Next.js única, com a estrutura atual de `src/`. Tudo novo entra nos diretórios que já existem (`lib/server`, `lib/perf`, `app/api`, `supabase/migrations`, `e2e`). Sem pacote ou serviço novo.

## Fases de entrega

| Fase | Conteúdo | Critério de merge |
|---|---|---|
| **1 — CRM** (este repo) | D1–D10, D12, D13 | CS-001 a CS-005 e CS-008 a CS-010 atendidos no preview (clarificação Q4) |
| **2 — Sincronizador** (n8n) | D11 | CS-006 e CS-007, com responsável nomeado. Não bloqueia a Fase 1 |

Ordem interna recomendada da Fase 1 (cada passo mensurável isoladamente):
1. Medir a linha de base (D13) **antes** de tudo.
2. Região `gru1` (D1): maior ganho por linha de mudança.
3. Traços e `Server-Timing` (D12): pra atribuir cada ganho seguinte.
4. `getClaims` + `resolveApiContext` (D2).
5. `product_metrics` + `selectAllPages` + projeções (D4, D5).
6. Snapshot (D3) + realtime seletivo (D7) + contagem compartilhada (D8).
7. Store de cache (D6) + perfil único (D9).
8. RLS InitPlan (D10), com `get_advisors`.
9. Aceite no preview (quickstart §4) e atualização do AGENTS.md.

## Riscos

| Risco | Mitigação |
|---|---|
| `getClaims` aceita sessão revogada em leituras até o JWT expirar | Mutações e admin continuam com `getUser` (`strict`). Papel continua vindo do banco a cada request. Documentado em D2 |
| Snapshot vaza dado pra role `client` pelo admin client | Regra por seção explícita + teste de regressão (quickstart §2) |
| Recriar políticas RLS muda o acesso | Mesma expressão, só embrulhada em `(select …)`. Comparar `pg_policies` antes e depois e rodar os testes de permissão |
| `vercel.json` com `regions` depende do plano da Vercel | Verificar no preview (`VERCEL_REGION` nos traços). Se o plano não permitir, configurar a região no painel e registrar isso |
| Sync (Fase 2) sem responsável | CS-006 e CS-007 ficam como follow-up explícito. A feature só é "totalmente concluída" com a Fase 2 |
| AGENTS.md desatualizado sobre estoque induz erro em trabalho futuro | Corrigir no último passo da Fase 1 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Tabela nova `performance_traces` (+ job `pg_cron`) | Decisão da clarificação Q5. Permite cruzar browser e servidor por `trace_id` com SQL | Logs da Vercel não guardam a etapa do browser e expiram rápido. O Sentry fica sem DSN neste projeto |
| Rota nova `/api/dashboard/snapshot` convivendo com as 4 antigas | `/agentes` e `/demanda-estoque` usam as rotas antigas, e trocar tudo de uma vez aumenta o risco | Remover as antigas agora exigiria reescrever duas telas fora do escopo |
