<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ARCIL CRM — Documentação Técnica

## Stack
- **Next.js 16** (App Router) + React 19 + TypeScript
- **Supabase** (auth + database + storage + realtime)
- **Chatwoot** (Application API) — caixa de atendimento em `/atendimento`
- **n8n** (geração de imagem do chatbot) + **serviço Python externo** (disparo de cobrança)
- **OpenAI GPT-4o** (chatbot + vision, no CRM) / **Seedream 5.0 Pro** (BytePlus ModelArk) via n8n para a imagem
- **sharp + satori** (composição da prévia técnica no servidor)
- **Sentry** (`@sentry/nextjs`) — opcional, desliga sozinho sem DSN
- **Tailwind CSS v4** + Framer Motion + Recharts
- **Vitest** (unit) + **Playwright** (e2e)

## Scripts

```
npm run dev        next dev
npm run build      next build
npm run lint       eslint
npm run typecheck  tsc --noEmit
npm run test       vitest run
npm run test:e2e   playwright test
```

CI (`.github/workflows/ci.yml`) roda lint → typecheck → test → build e depois e2e.
Usa `npm install`, **não `npm ci`**: o lockfile foi gerado no Windows e não carrega
as optional deps Linux-only (binários do sharp), o que fazia `npm ci` falhar no runner.

## Estrutura de pastas

```
src/
  proxy.ts            → middleware do Next 16 (roda em TODA request, inclusive /login;
                        constrói o client Supabase server-side — sem env ele 500a antes
                        de qualquer página renderizar)
  app/
    page.tsx          → Dashboard / central operacional ao vivo
    admin/            → Gestão de usuários (superadmin only)
    agentes/          → Monitoramento dos agentes IA por segmento
    atendimento/      → Caixa de entrada Chatwoot (conversas, inboxes, mensagens)
    cerebro/          → "Cerebro Arcil" — placeholder, em construção
    chatbot/          → Gerador de imagem de instalação de AC (wizard + marcação)
    cobranca/         → Disparo, monitoramento, board financeiro, follow-ups
    demanda-estoque/  → Catálogo de produtos + sinal de demanda
    leads/            → Tabela de leads com filtros
    login/            → Login (Turnstile opcional)
    api/
      admin/users/, admin/users/[id]/, admin/leads/[id]/, admin/activity/
      agents/summary/, agents/[id]/conversations/
      atendimento/inboxes/, atendimento/conversations/[id]/messages/
      chat/                        → GPT-4o conversação do chatbot
      check-result/
      cobranca/disparo/            → valida telefones, chama o Python, confere gravação
      cobranca/financial-handoffs/
      cobranca/reenviar-nao-disparados/
      dashboard/snapshot/          → o que o dashboard chama: todas as seções numa
                                     request (permissão por seção, Server-Timing)
      dashboard/summary/, dashboard/pending-center/  (compatibilidade)
      perf/traces/                 → etapas medidas no browser → performance_traces
      generate-image/, generate-image/condensadora-local/
      inventory/summary/
      leads/, leads/[id]/, leads/[id]/conversations/, leads/[id]/financial-handoff/
      products/search/
  components/
    console/   → console-shell.tsx (ConsolePage, ConsoleCard, ConsoleMetric,
                 ConsoleStatus, ConsoleButton, ConsoleInput, ConsoleTable,
                 ConsoleLoading, ConsoleError), console-skeleton, versiculo
    layout/    → sidebar, main-wrapper, providers, access-guard
    ui/        → badge, button, empty-state, toast, turnstile-widget, drawers
                 (lead-drawer, cobranca-log-drawer, agent-conversations-drawer)
  hooks/
    use-current-user.tsx → role + permissões (Context; NÃO seta loading em
                           refresh de token, senão AccessGuard desmonta a página)
    use-supabase.ts      → hook genérico; com chave (`useSupabase(key, fn)`) usa o cache de tela
    use-urgent-followups.tsx → UMA contagem de follow-ups urgentes por sessão
                           (snapshot abastece, sidebar lê)
    use-sidebar.tsx, use-theme.tsx
  lib/
    env.ts             → leitura saneada de TODA env var (strip de não-ASCII/BOM)
    client-api.ts      → useApi (cache de tela) + fetchJson
    api-cache.ts       → último dado de cada tela, SÓ em memória da aba (30 s
                         fresco, stale-while-revalidate). Nunca localStorage:
                         é dado pessoal. Logout limpa.
    realtime-sections.ts → tabela → seções do dashboard + janela de 2 s
    perf/              → trace-context (AsyncLocalStorage, timeStage, conta idas
                         ao Supabase), trace-server, trace-client, trace-validate
    marcacao.ts        → geometria da marcação sobre a foto (fração 0-1)
    watermark-badge.ts, versiculo-do-dia.ts, utils.ts
    chatwoot/client.ts → Chatwoot Application API (lança erro só na 1ª request)
    supabase/          → client.ts (browser), server.ts (cookies), admin.ts
                         (service role — só em API routes), queries.ts
    server/
      api-auth.ts          → requireApiUser / requireApiPermission /
                             requireStaffUser / superadmin — ENFORCEMENT real.
                             Leitura: getClaims (JWT ES256 verificado local).
                             Mutação: `{ strict: true }` → getUser, que
                             enxerga sessão revogada. Rota nova que ESCREVE
                             tem que passar strict.
      dashboard-snapshot.ts → seções do dashboard, cada fonte lida uma vez
      product-metrics.ts   → números do catálogo via rpc product_metrics()
      select-all-pages.ts  → paginação completa (PostgREST corta em 1.000 sem avisar)
      roles.ts             → ROLE_PERMISSIONS
      crm-data.ts          → (72 KB) agregações do CRM
      crm-metrics.ts, crm-labels.ts, demanda.ts
      financial-handoff.ts → handoff financeiro → vendedor
      installation-overlay.ts / preview-annotations.ts / satori-nodes.ts /
      guide-mask.ts / install-schematic.ts / previa-tipos.ts / layouts/
      env-guard.ts
  types/index.ts   → tipos das tabelas Supabase
  types/api.ts     → contratos das rotas /api
supabase/
  migrations/      → migrações versionadas (últimas: 20260923_product_metrics,
                     20260923_rls_initplan_my_role, 20260923_performance_traces)
  functions/hybrid-search/
  schema.sql
e2e/login.spec.ts
scripts/seed.mjs, scripts/generate-arcil-checklist-pdf.mjs
```

## Supabase

- **Projeto ID:** `swcqvrowqwylcegrcesu`
- **URL:** `https://swcqvrowqwylcegrcesu.supabase.co`
- **Tabelas principais:** `leads`, `followups`, `cobranca_log`, `cobranca_empresas`, `vendors`, `conversations`, `messages`, `user_profiles`, `financial_handoff_resolutions`, `cobranca_handoff_boleto_decisions`, `out_of_stock_requests`, `crm_image_generations`, `activity_log`
- **Produtos:** não existe `products_cache`. O catálogo vive em quatro tabelas por segmento — `products_consumer`, `products_reseller`, `products_installer`, `products_builder_architect` — e o CRM as unifica em `fetchProducts()`.
- **Buckets:** `chatbot-images` (fotos da parede), `PDF` (imagens geradas)
- **Migrações:** versionadas em `supabase/migrations/`. Toda mudança de schema entra como arquivo novo ali — não editar migração já aplicada.

### Estoque

O workflow n8n "ERP — SALDO DE ESTOQUE" grava `estoque` e `estoque_transito` de hora em hora nas **quatro** tabelas de produto (inclusive `products_builder_architect`, que tem a coluna). Em 2026-09-22, ~97% das linhas tinham saldo. `estoque` nulo continua significando "o ERP não mandou saldo" — nunca zero —, e a tela mostra "não sincronizado" nesse caso.

Contagem de produto é por `codigo_erp` (a mesma geladeira tem uma linha por segmento) e sai de `public.product_metrics()`: dashboard, pendências e `/demanda-estoque` usam o mesmo número. O sinal de demanda vem de `out_of_stock_requests`, que o agente preenche quando não consegue atender um pedido.

**O sync regrava todas as linhas mesmo sem mudança** (~2,4 mi de updates em `products_reseller`, que tem 1.509 linhas) — é o maior consumidor de CPU do banco. Correção descrita em `specs/001-otimizar-performance-crm/contracts/erp-sync-change.md` (`IS DISTINCT FROM` nos UPDATEs). `estoque_transito` (migração `20260824_add_estoque_transito.sql`) rastreia o que está a caminho, separado do vendável.

### Lista de bloqueio (`blocked_phones`)

Números da própria Arcil (agentes, números de vendas) que o agente de WhatsApp ignora. O workflow n8n **AGENTE COMPLETO ARCIL** consulta a tabela no nó **LISTA DE BLOQUEIO**, logo depois de `VERIFICA NUMERO1`: número ativo encerra a execução sem criar lead e sem resposta da IA. Se a consulta falhar, a mensagem segue normal — a lista nunca pode calar o bot.

- Bloquear: `insert into blocked_phones (phone, motivo) values (55DDDNUMERO, motivo);` (13 dígitos, com o nono)
- Liberar para teste (ex.: Paulo testando o agente): `update blocked_phones set ativo = false where phone = ...;` e depois voltar para `true`.
- Os números não ficam no repositório, só no banco.

### Tabela `user_profiles`
Colunas: `id` (FK auth.users), `email`, `full_name`, `role` (enum), `permissions` (jsonb), `created_at`, `updated_at`

Enum `user_role`: `superadmin`, `owner`, `manager`, `vendor`, `employee`, `client`

Criada automaticamente via trigger `on_auth_user_created` quando um usuário é adicionado ao Auth.

### RLS
- `user_profiles`: usuário lê/edita apenas o próprio perfil
- Admin (service role) bypassa RLS → usar sempre via API routes (`/api/admin/`)
- Advisors do Supabase foram endurecidos em `20260903_advisor_hardening.sql` e `20260903_secure_financial_handoff_rpcs_and_chatbot_bucket.sql`. Rodar `get_advisors` depois de qualquer DDL.

## Roles e permissões

`ROLE_PERMISSIONS` vive em `src/lib/server/roles.ts` — essa é a fonte da verdade:

| Role        | Permissões                                                                                          |
|-------------|-----------------------------------------------------------------------------------------------------|
| superadmin  | view_all, manage_users, manage_roles, manage_cobranca, manage_estoque, manage_gerador_imagem, manage_atendimento |
| owner       | view_all, manage_cobranca, manage_estoque, manage_gerador_imagem, manage_atendimento                |
| manager     | view_all, manage_cobranca, manage_atendimento                                                        |
| vendor      | view_leads                                                                                           |
| employee    | view_leads                                                                                           |
| client      | (nenhuma)                                                                                            |

`permissions` (jsonb em `user_profiles`) sobrescreve/estende o default do role por usuário.

**Duas camadas, sempre as duas:**
- `<AccessGuard perm="...">` (`components/layout/access-guard.tsx`) só esconde a UI.
- `requireApiPermission("...")` / `requireStaffUser()` (`lib/server/api-auth.ts`) é o enforcement de verdade. Rota nova sem isso = dado exposto.

Super admins atuais: `lukeottoboni@gmail.com`, `welisonfelipe132@gmail.com`

## Variáveis de ambiente (`.env.local`)

Toda leitura passa por `src/lib/env.ts`, que remove não-ASCII e BOM — env var copiada do Windows já quebrou o header do fetch do Supabase mais de uma vez.

**Obrigatórias:**
```
NEXT_PUBLIC_SUPABASE_URL=https://swcqvrowqwylcegrcesu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        ← /api/admin/* e todo uso de createAdminClient
OPENAI_API_KEY=...
```

**Chatbot / gerador de imagem:**
```
N8N_CHATBOT_WEBHOOK=...              ← webhook do n8n que gera a cena
N8N_CONDENSADORA_WEBHOOK=...         ← prévia do local da condensadora
```

**Atendimento (Chatwoot):**
```
CHATWOOT_BASE_URL=...
CHATWOOT_ACCOUNT_ID=...
CHATWOOT_API_ACCESS_TOKEN=...
```
Opcionais no boot: `lib/chatwoot/client.ts` só lança erro quando uma request precisa mesmo chegar no Chatwoot.

**Handoff financeiro:**
```
N8N_FINANCIAL_HANDOFF_WEBHOOK=...
N8N_FINANCIAL_HANDOFF_SECRET=...
```

**Cobrança (serviço Python):**
```
PYTHON_COBRANCA_URL=...      ← default hardcoded: https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca
PYTHON_BASE_URL=...          ← default hardcoded: mesma host, sem path
```

**Opcionais:**
```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   ← sem isso o captcha do login some silenciosamente
NEXT_PUBLIC_SENTRY_DSN=...           ← client
SENTRY_DSN=...                       ← server/edge
SENTRY_ORG=, SENTRY_PROJECT=, SENTRY_AUTH_TOKEN=   ← upload de sourcemap no build
V2_CASSETTE_LAYOUT=1                 ← liga o layout V2 pra família cassete
INFRA_VISUAL=vetorial|gemini_3d     ← padrão modelo_3d (ver "Divisão de responsabilidade")
PREVIA_DUMP=1                        ← dump de debug da prévia
```
Sem DSN, o Sentry fica desabilitado e não envia nada — é seguro deixar em branco.

## Fluxo de Cobrança (Disparos)

**O disparo NÃO passa mais pelo n8n** — vai para um serviço Python externo
(`PYTHON_COBRANCA_URL`, hospedado no easypanel). `NEXT_PUBLIC_N8N_COBRANCA_WEBHOOK`
no `.env.local` é resíduo e não é lido por nenhum código.

1. Upload de CSV/XLSX em `/cobranca` (aba Disparar → `_components/disparar-tab.tsx`)
2. Frontend parseia com `xlsx` (sheetjs) — colunas: telefone/fone/celular/whatsapp, nome, valor, vencimento, documento
3. Preview antes de confirmar; teto de **1000 leads por disparo**
4. POST `/api/cobranca/disparo` (`requireApiPermission("manage_cobranca")`):
   - normaliza telefone para `^55\d{10,11}$`; recusados (vazio / fixo / inválido) **são gravados** em `cobranca_log` com `status_disparo = "NAO DISPARADO"` e o motivo em `metadata` — senão ninguém descobre que aquele boleto ficou de fora
   - encaminha os válidos ao serviço Python
   - `waitForRows()` reconsulta até 8 s: o Python responde 200 **antes** de inserir, e descarta lead em silêncio; a conferência existe por causa disso
5. Realtime (`postgres_changes`) atualiza a tabela ao vivo. O realtime emite **um evento por linha** — um disparo em lote grava dezenas de uma vez, então os refetches são agrupados com debounce (mesmo padrão em `src/app/page.tsx`)
6. `/api/cobranca/reenviar-nao-disparados` chama `POST {PYTHON_BASE_URL}/reenviar-pendentes`

Abas de `/cobranca`: Disparar · Logs · Financeiro (board de handoff) · Follow-ups · Técnico (superadmin).

## Fluxo do Chatbot (Gerador de Imagem AC)

1. Usuário envia foto da parede → upload direto para bucket `chatbot-images` via Supabase JS client
2. GPT-4o (via `/api/chat`) conduz conversa e coleta: modelo, pé direito, ponto elétrico, unidade externa, tubulação
3. Quando tudo coletado, `/api/chat` retorna `readyToGenerate: true` (sinalizado pelo `##READY##` no response)
4. `/api/generate-image` extrai dados estruturados + analisa imagem com Vision + chama n8n webhook
5. n8n monta o prompt (código, sem LLM), gera a imagem no Seedream, salva no bucket `PDF/{lead_id}`, responde via "Respond to Webhook"
6. URL retornada é exibida no chat com opção de download

### Marcação na foto

Logo depois do upload da foto, o vendedor marca sobre ela (`_components/marcador-instalacao.tsx`): retângulo do aparelho (obrigatório), traçado da tubulação e ponto elétrico (opcionais). Tudo em fração 0-1 do lado da foto — pixel de tela não sobrevive à diferença de tamanho entre o celular, a cena que o Gemini devolve e a composição final.

A marcação alimenta dois destinos com precisões diferentes:

- **imagem-guia** (`lib/server/guide-mask.ts`): a foto com retângulo magenta / linha ciano / ponto amarelo desenhados por cima, mandada como uma imagem a mais pro Gemini. Modelo de imagem obedece máscara visual; não obedece coordenada escrita. As cores são impossíveis num ambiente residencial de propósito, e o prompt do n8n proíbe reproduzi-las na saída.
- **âncora exata** da camada vetorial (`lib/server/preview-annotations.ts`): callouts com linha de chamada, cotas, rota colorida e fluxo de ar caem no lugar que o vendedor marcou.

Pular a marcação é sempre permitido: sem ela a prévia usa o layout antigo (título + 4 cards), que não depende de saber onde o aparelho está na cena.

### Divisão de responsabilidade (não quebrar)

O modelo de imagem desenha SÓ a cena física: sala, aparelho e — no modo padrão `modelo_3d` — a tubulação/canaleta em 3D, **sem nenhuma letra**. Todo texto, cota, ícone, legenda e fluxo de ar é vetor desenhado por `installation-overlay.ts` / `preview-annotations.ts` com satori e fonte local. Modelo de imagem erra texto — o Gemini já escreveu "2,80m" onde o vendedor respondeu 2,70 e "FLOXO DE AR"; o Seedream, "EVAPORADora" e "eté o teto". Quem desenha o quê por modo: `ModoInfra` em `lib/server/previa-tipos.ts` (`modelo_3d` padrão, `gemini_3d` legado com texto do modelo, `vetorial` CRM desenha tudo).

`preview-annotations.ts` desenha só linha em SVG; o texto vem como nó satori por cima. SVG embutido como `<img>` NÃO recebe as fontes passadas ao `satori()`, e `<text>` ali sai em branco.

### n8n: só um dos grupos é nosso

`PVtyGZ6gQrBABe83` tem três grupos de nós no mesmo canvas. O do CRM é o do `Webhook` de path `6fdf0bcb-…` (o que bate com `N8N_CHATBOT_WEBHOOK`):

```
Webhook → Edit Fields2 → MONTA PROMPT SEEDREAM (Code) → HTTP Request1 (Seedream 5.0 Pro)
  → Edit Fields3 → Convert to File2 → COLOCA NO STORAGE3 → link da imagem2 → Respond to Webhook
```

- **MONTA PROMPT SEEDREAM**: prompt montado por código a partir das respostas do vendedor (antes um GPT-5.1 fazia isso — a conta ficou sem crédito em 2026-09-24 e o gerador parou). Mesmas regras do roteiro antigo; imagens na ordem base → produto → referência da família → guia.
- **HTTP Request1**: `POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations`, modelo `dola-seedream-5-0-pro-260628` (o flash é `dola-seedream-5-0-flash-260915`), credencial n8n **"Seedream (BytePlus ModelArk)"**, `size` no mesmo formato da foto base (o CRM desenha por cima em frações). Não aceita `sequential_image_generation`. ~55 s por imagem; o CRM espera até 240 s.

**Armadilha:** com o editor do n8n aberto numa aba, salvar de lá sobrescreve qualquer alteração feita via API depois que a aba foi aberta — o editor grava o estado inteiro que tem em memória. Um ramo inteiro (modo de ajuste) já sumiu assim. Recarregue a aba antes de editar manualmente.

## Design System

- Tipografia: **Montserrat** (UI — mesma fonte do site institucional arcil.com.br) + **IBM Plex Mono** (dados numéricos, classe `font-data`)
- Tema: variáveis CSS em `globals.css` — sempre `var(--bg-surface)`, `var(--text-primary)`, `var(--text-muted)`, `var(--border-strong)`, `var(--bg-inset)`
- Dark/light via classe `.dark` — NÃO usar `bg-white` hardcoded
- **Tela nova usa o console shell**, não os componentes antigos: `ConsolePage`, `ConsoleCard`, `ConsoleMetric`, `ConsoleStatus`, `ConsoleButton`, `ConsoleInput`, `ConsoleTable`, `ConsoleLoading`, `ConsoleError` (`components/console/console-shell.tsx`). `MetricCard`/`SectionTitle`/`Card` do design antigo não existem mais.
- Drawers de detalhe (lead, log de cobrança, conversas do agente) vivem em `components/ui/`.

## Armadilhas conhecidas

- **`npm ci` falha.** O lockfile nasceu no Windows e não tem as optional deps Linux do `sharp`. Use `npm install` (é o que o CI faz).
- **`sharp` some do `node_modules` sozinho.** Sintoma: `typecheck` cospe `TS2307: Cannot find module 'sharp'` em 5 arquivos, `installation-overlay.test.ts` falha ao importar, e o `build` morre com `Cannot find module 'require-in-the-middle'`. Conserto: `npm install`. Não é bug do repo.
- **Lint local varre `.worktrees/`.** `eslint.config.mjs` ignora `.claude/worktrees/**`, mas os worktrees deste repo ficam em `/.worktrees/` (raiz). Resultado: `npm run lint` acha milhares de problemas dentro de checkouts aninhados. O CI passa porque lá não existe `.worktrees/`. Pra ver só o código real: `npx eslint src e2e scripts`.
- **`src/proxy.ts` roda em toda request**, `/login` inclusive, e constrói o client Supabase sem condição. Sem `NEXT_PUBLIC_SUPABASE_*` ele 500a antes de qualquer página aparecer — inclusive o próprio formulário de login.
- **Realtime emite um evento por linha.** Disparo em lote grava dezenas de linhas de uma vez. Agrupe numa janela de 2 s que abre no primeiro evento e **não reinicia** (`REALTIME_WINDOW_MS` em `lib/realtime-sections.ts`) — debounce que reinicia adia a tela indefinidamente durante um lote grande. No dashboard, cada tabela só invalida as seções que dependem dela.
- **Admin client ignora RLS.** Dado que o browser lia com RLS e passou a vir por rota com `createAdminClient` precisa da regra reaplicada à mão na rota — ex.: `activity`/`urgentFollowups` no snapshot exigem staff, porque a RLS `staff_read_*` barrava a role client.
- **`use-current-user` não seta `loading` em refresh de token.** O Supabase dispara `onAuthStateChange` toda vez que a aba volta ao foco; como `AccessGuard` desmonta os filhos enquanto carrega, isso apagava o estado do wizard do Gerador de Imagem só de trocar de aba.

## Deploy (Vercel)

- Projeto Vercel: `crm-arcil`, escopo **`felps-debugs-projects`** (`.vercel/project.json`). Conta `ottoboniluke` não tem acesso a esse escopo — `vercel` CLI/MCP retorna 403 sem re-autenticar nele.
- Push em `master` → deploy de produção automático via integração GitHub (`vercel[bot]`). PR → preview.
- **Região: `gru1`** (`vercel.json`), perto do banco em `sa-east-1`. Antes as funções rodavam no padrão `iad1` e cada query cruzava o continente. `performance_traces.region` confirma onde a função rodou.
- Repo canônico: `felps-debug/crm-arcil` (remote `origin`). `ottoboniluke/crm-arcil` é fork/espelho (remote `ottoboniluke`).
- Configurar as mesmas env vars do `.env.local` no painel da Vercel.
