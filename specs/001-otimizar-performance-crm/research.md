# Pesquisa (Fase 0): Otimizar Performance do CRM

**Data**: 2026-09-22 · **Spec**: [spec.md](./spec.md) · **Plano**: [plan.md](./plan.md)

Evidência coletada nesta sessão: leitura do código em `src/`, `pg_stat_statements`,
`pg_stat_user_tables`, `pg_policies`, `pg_publication_tables`, o JWKS público do
Supabase e a documentação do Next 16 em `node_modules/next/dist/docs/`.

## Fatos levantados

| Fato | Evidência | Impacto |
|---|---|---|
| Banco em `sa-east-1` (São Paulo) | `get_project` → `region: sa-east-1` | As funções da Vercel devem ficar em `gru1` |
| Nenhuma região configurada na Vercel | Não existe `vercel.json` e nenhum `preferredRegion` em `src/` | As funções rodam no padrão `iad1` (EUA), então cada ida ao banco atravessa o equador |
| JWT assinado com ES256 (assimétrico) | `/auth/v1/.well-known/jwks.json` → `alg: ES256` | `auth.getClaims()` verifica localmente, sem ida ao Auth server |
| Sincronizador ERP é o n8n "ERP — SALDO DE ESTOQUE", roda de hora em hora | `supabase/migrations/20260817_erp_sync_columns.sql` e `20260824_add_estoque_transito.sql` | Fica fora do repo e entra na Fase 2 |
| O sync regrava tudo, sem filtrar o que mudou | `UPDATE products_reseller p SET estoque = v.qtd FROM (VALUES …)`: ~5,8 s por chamada, 141 chamadas, 208 mil linhas; `n_tup_upd` = 2,4 mi em `products_reseller` com 1.509 linhas vivas | Principal consumidor de CPU (RF-016) |
| Um upsert de catálogo reescreve `content` e `embedding` | PostgREST `UPDATE products_installer SET … embedding …`: 45 mil chamadas, 42 ms de média | Cada linha regravada atualiza o índice HNSW (Fase 2) |
| Hoje o `estoque` vem preenchido | Consumer 885/886, reseller 1481/1509, installer 859/889 com `estoque` não nulo | **O AGENTS.md ("`estoque` null em todas as linhas") está desatualizado** |
| `codigo_erp` é único em cada tabela e nunca nulo | Índice `*_codigo_erp_key` UNIQUE; `sem_codigo = 0` nas 4 tabelas | A regra de identidade canônica é `codigo_erp` |
| Contar produtos disponíveis é caro | `SELECT codigo_erp FROM products_consumer WHERE estoque > $1 LIMIT/OFFSET`: 1,28 s de média | Paginado, em série, disputando com o sync |
| Tabelas centrais pequenas | leads 94, followups 94, cobranca_log 99, conversations 53 | O truncamento em 1.000 linhas é risco futuro, sem erro hoje; os testes precisam de dados sintéticos |
| As políticas RLS chamam `my_role()` sem `(select …)` | `pg_policies`: `qual = my_role() = ANY(...)` | O Postgres avalia a função por linha (achado 12). Afeta as queries do browser e o Realtime |
| O Realtime é a query mais cara do banco | `SELECT wal->>… FROM realtime…`: 573 mil chamadas, 5.186 s no total | Escrita desnecessária do sync gera WAL que o Realtime decodifica |
| `pg_cron` está instalado | `pg_available_extensions` | Dá pra fazer a retenção de `performance_traces` no próprio banco |
| As rotas do dashboard buscam as mesmas tabelas | `getDashboardSummary`, `getPendingCenter` e `getAgentSummary` chamam `fetchCore()`; o cache de 5 s (`cachedTable`) vale só dentro de uma instância serverless | A mesma leitura central se repete (achado 2) |
| Cada rota verifica a identidade de novo | `requireApiUser()` → `auth.getUser()` (rede) em cada uma das 4 rotas, mais `user_profiles` em `requireApiPermission` | Achado 5 |
| `/api/inventory/summary` exige `manage_estoque` | `src/app/api/inventory/summary/route.ts` | O snapshot precisa **manter** esse corte por permissão (RF-002) |
| O perfil é carregado várias vezes | `use-current-user.tsx` chama `load()` no mount **e** em todo `onAuthStateChange` (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED) | Achado 9 |
| A contagem de follow-ups urgentes é duplicada | `getUrgentFollowupsCount()` em `app/page.tsx:124` e `components/layout/sidebar.tsx:64` | Achado 10 |
| Qualquer evento de Realtime recarrega tudo | `app/page.tsx:105-116`: qualquer evento → `refresh()` → 5 fetches + contagem urgente | Achado 7 |
| Leituras com `select("*")` | `coreTables` (followups, conversations, vendors, cobranca_log, quotes, sales) e `sheet_sources` | Achado 8 |

## Decisões

### D1. Região de execução (RF-008)

- **Decisão**: criar `vercel.json` com `"regions": ["gru1"]`. Versionado no repo, vale igual pra produção e preview, o que atende a Q2 da clarificação.
- **Por quê**: o banco está em `sa-east-1` e os usuários estão no Brasil. Hoje cada query faz ida e volta EUA↔SP (~120–150 ms de RTT), e o dashboard encadeia várias.
- **Contingência**: se `gru1` estiver indisponível, a Vercel sinaliza o problema no deploy. O rollback é reverter o `vercel.json`, e o deploy volta pro padrão sem mudança de código. O runbook fica em `quickstart.md`.
- **Alternativas rejeitadas**: `preferredRegion` por rota (espalha a decisão por vários arquivos, e o `proxy.ts` não aceita config de runtime). Configurar a região só no painel da Vercel (não fica versionado nem é revisável).

### D2. Verificação de identidade (RF-002, RF-009, RF-010)

- **Decisão**: `requireApiUser()` passa a usar `supabase.auth.getClaims()`. Com ES256 a verificação é local, e o JWKS fica em cache no processo. O `proxy.ts` troca `getSession()` por `getClaims()`, mesmo custo e agora verificado. Rotas de **mutação e admin** continuam com `getUser()` via `requireApiUser({ strict: true })`.
- **Por quê**: elimina a ida ao Auth server em toda leitura sem aceitar sessão não verificada. Para ações irreversíveis (disparo de cobrança, admin de usuários), a checagem continua sendo feita no servidor.
- **Trade-off documentado**: com `getClaims()`, uma sessão revogada continua aceita em **leituras** até o JWT expirar (padrão de 3.600 s). A autorização por papel continua lendo `user_profiles` a cada request, então mudança de papel vale na hora.
- **Alternativas rejeitadas**: `getSession()` (não verifica assinatura, viola o RF-009). Manter `getUser()` em tudo (não atende o CS-001).

### D3. Carga consolidada do dashboard (RF-001, RF-002, CS-003)

- **Decisão**: nova rota `GET /api/dashboard/snapshot?sections=…` com uma autenticação, uma leitura de perfil e uma chamada a `fetchCore()`, que monta `summary`, `pending`, `agents`, `inventory`, `activity` e `urgentFollowups`. Cada seção é calculada em `Promise.allSettled`, e a falha de uma não derruba as outras. A seção `inventory` só entra se o usuário tiver `manage_estoque` (mesma regra da rota atual). Senão ela volta com `status: "forbidden"`.
- **Por quê**: hoje são 4 rotas × (auth + perfil + fetchCore) mais 4 queries do browser. Consolidar reduz as leituras pra ≤ 12 e garante que todos os números saem do mesmo instante.
- **Compatibilidade**: as rotas atuais (`/api/dashboard/summary`, `/pending-center`, `/api/agents/summary`, `/api/inventory/summary`) continuam existindo, porque `/agentes` e `/demanda-estoque` as usam. Elas passam a delegar pras mesmas funções de seção.
- **Alternativas rejeitadas**: Server Component com streaming (reescreve a página inteira, que é `"use client"` com realtime, e fica fora do escopo "não redesenha"). GraphQL ou BFF novo (infra nova).

### D4. Métricas de produto no banco (RF-003, RF-004, RF-005, RF-007)

- **Decisão**: função SQL `public.product_metrics()` que faz `UNION ALL` das 4 tabelas, deduplica por `codigo_erp` (fallback `'linha:'||tabela||':'||id` se algum dia vier nulo) e devolve numa linha só `total_distintos`, `com_estoque_conhecido`, `disponiveis` (> 0), `zerados` (<= 0), `estoque_baixo` (1–10) e `sincronizado`. Um produto conta como disponível se tiver saldo em **qualquer** tabela.
- **Privilégio (RF-019)**: `SECURITY INVOKER`, `STABLE`, `search_path` fixo. `REVOKE ALL … FROM public, anon, authenticated`; `GRANT EXECUTE … TO service_role`. Só é chamada pelo admin client, depois de `requireApiUser`.
- **Por quê**: substitui ~7 a 10 queries paginadas em série (1,28 s cada, sob contenção) por uma única, e o mesmo número alimenta o dashboard, as pendências e `/demanda-estoque` (RF-005).
- **Alternativas rejeitadas**: view materializada (precisa de refresh e deixa o dado velho). Tabela de agregados mantida pelo sync (acopla à Fase 2).

### D5. Leituras completas e com projeção (RF-006, RF-007)

- **Decisão**: um helper `selectAllPages(query, pageSize = 1000)` percorre `range()` até esgotar, com um teto explícito (`MAX_ROWS = 20_000`). Se passar do teto, **lança** um erro nomeado em vez de truncar. Os `coreTables` trocam `select("*")` por listas de colunas usadas de fato, e `sheet_sources` passa a `select("id,last_synced_at")`.
- **Por quê**: o PostgREST corta em 1.000 linhas sem erro. Hoje não dispara (94 linhas), mas `cobranca_log` cresce com cada disparo de até 1.000 leads.

### D6. Cache de tela no cliente (RF-012, RF-013, CS-002)

- **Decisão**: evoluir o `useApi` pra um store em memória no nível do módulo (`Map<url, Entry>`) com stale-while-revalidate: fresco por 30 s, revalida em segundo plano no retorno e em invalidação, e cada request leva um número de sequência pra que resposta atrasada não sobrescreva uma mais nova. Nada em `localStorage`/`sessionStorage`/IndexedDB (clarificação Q1). O store é limpo no `SIGNED_OUT`.
- **Por quê**: resolve o CS-002 sem dependência nova, com ~80 linhas, e todas as 28 chamadas de `useApi`/`useSupabase` ganham o comportamento de uma vez.
- **Alternativas rejeitadas**: SWR ou TanStack Query (dependência nova pra um padrão pequeno. Aceitável, mas desnecessário). Cache HTTP da Vercel (os dados são por usuário).

### D7. Realtime seletivo (RF-014, CS-004)

- **Decisão**: tabela fixa `origem → seções` e um debounce de **2 s por seção**:
  - `leads` → summary, pending, agents, activity
  - `followups` → summary, pending, urgentFollowups, activity
  - `cobranca_log` → summary, pending, activity
  - `conversations` → summary, agents

  Ao fim da janela, uma única chamada `snapshot?sections=<união>`. `inventory` nunca é invalidada pelo Realtime, porque produtos não estão na publicação. O canal é removido no unmount (já acontece hoje).
- **Por quê**: hoje qualquer evento dispara as 5 cargas com debounce de 500 ms. Nem todo lead toca o inventário.

### D8. Contagem de follow-ups urgentes compartilhada (RF-015)

- **Decisão**: `UrgentFollowupsProvider` em `components/layout/providers.tsx` guarda a contagem e é atualizado pelo snapshot (seção `urgentFollowups`) quando o dashboard está aberto, e pelo intervalo de 5 min que a sidebar já tem. Sidebar e dashboard leem do contexto.

### D9. Perfil carregado uma vez (RF-011, CS-008)

- **Decisão**: `CurrentUserProvider` passa a reagir só ao `onAuthStateChange`, sem o `load()` inicial duplicado, porque `INITIAL_SESSION` já chega no mount. Usa `session.user` do evento em vez de chamar `getUser()`. Recarrega o perfil só se `user.id` mudou, ou em `SIGNED_IN`/`USER_UPDATED`. Ignora `TOKEN_REFRESHED` quando o id é o mesmo. Busca só `id,email,full_name,role,permissions`.
- **Segurança**: o perfil do cliente só controla UI. O enforcement continua no servidor (`requireApiPermission`).

### D10. RLS com avaliação única (RF-018)

- **Decisão**: migração que recria as políticas trocando `my_role()` por `(select public.my_role())`. O Postgres passa a tratar a chamada como InitPlan, avaliada uma vez por statement. O resultado da autorização fica **idêntico** (mesma expressão). Rodar `get_advisors` (security e performance) depois.
- **Alternativa rejeitada**: custom claim de papel no JWT (muda o fluxo de login e a revogação de papel passa a depender da expiração do token).

### D11. Sincronizador ERP (RF-016, RF-017, Fase 2)

- **Decisão**: no workflow n8n "ERP — SALDO DE ESTOQUE", acrescentar `WHERE p.estoque IS DISTINCT FROM v.qtd` (e o mesmo pra `estoque_transito`) nos `UPDATE … FROM (VALUES …)`. `IS DISTINCT FROM` já trata as transições nulo↔número como mudança e nulo→nulo como igual. No upsert de catálogo que reescreve `content`/`embedding`, só gerar embedding e fazer upsert quando `nome`/`content` mudar.
- **Entrega**: runbook próprio (`contracts/erp-sync-change.md`) com responsável, workflow, backup do JSON antes, validação por `n_tup_upd` e rollback. **Armadilha do AGENTS.md**: com o editor do n8n aberto, salvar sobrescreve mudanças feitas via API.

### D12. Traços de performance (RF-020, RF-021, CS-009)

- **Decisão**: tabela `performance_traces` (clarificação Q5). O browser gera um `traceId` (UUID) por jornada e manda no header `x-trace-id`. O servidor cronometra as etapas (`auth`, `profile`, `core`, `products`, `section:*`), conta as requests ao Supabase com um contador em `AsyncLocalStorage` dentro do `fetchWithSupabaseTimeout`, e grava **depois** da resposta com `after()` do Next, sem somar latência. O browser manda as marcas dele (TTFB, pronto) num `POST /api/perf/traces`. Os mesmos tempos saem no header `Server-Timing`.
- **Privacidade**: guarda `user_id` (UUID), nunca e-mail, telefone, token ou payload. RLS ligada: sem política pra `anon`/`authenticated` no insert (quem grava é o service role), e SELECT só pra superadmin.
- **Retenção**: job `pg_cron` diário apaga linhas com mais de 30 dias.

### D13. Medição de aceite (RF-022, CS-001 a CS-003)

- **Decisão**: script Playwright `e2e/perf/dashboard.perf.ts`, fora do `npm run test:e2e` padrão (projeto `perf` separado), contra `PERF_BASE_URL` (preview) com um usuário de teste. **Carga fria** = `browser.newContext()` com o `storageState` do login e sem cache HTTP (clarificação Q3). **Carga quente** = ir pra `/leads` e voltar na mesma aba. "Utilizável" = o atributo `data-dashboard-ready="true"`, que o dashboard marca quando as seções essenciais (summary, pending) renderizam. Saída em JSON com p50/p95. O número de operações vem de `performance_traces.supabase_requests`.
- **Linha de base**: rodar o mesmo script contra um preview do `master` atual **antes** de mesclar qualquer mudança.

## Fora do plano (confirmado)

- `SELECT name FROM pg_timezone_names` (934 ms × 714) vem da introspecção do PostgREST/dashboard do Supabase, não do CRM.
- Redis, upgrade do banco e otimização de bundle ficam fora (RF-024).
