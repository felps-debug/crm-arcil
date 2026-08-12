---
target: CRM ARCIL — app completo
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 3
timestamp: 2026-08-12T18-28-32Z
slug: src-app-page-tsx
---
⚠️ DEGRADED: single-context (sub-agents disabled by project instruction "Do not call the AgentTool unless the user requested it")

## Design Health Score

| # | Heurística | Nota | Problema chave |
|---|-----------|-------|-----------|
| 1 | Visibilidade do estado | 3 | "FILAS ABERTAS 0" com "Carregando filas…" logo abaixo; toggle de tema muda o rótulo mas não a página |
| 2 | Sistema × mundo real | 3 | "FILAS ABERTAS 2659" — 2653 são "produtos sem estoque" de um ERP que não envia quantidade. Não é fila |
| 3 | Controle e liberdade | 2 | Nenhuma linha do quadro é clicável; "Modo claro" não funciona em `/` |
| 4 | Consistência e padrões | 1 | Três sistemas visuais no mesmo app; dois blocos `.dark` conflitantes em globals.css |
| 5 | Prevenção de erro | 2 | Preview de CSV e AccessGuard são bons; erros de API caem crus na tela |
| 6 | Reconhecer > lembrar | 3 | Tons (azul/violeta/ciano/âmbar) codificam estado sem legenda alguma |
| 7 | Flexibilidade e eficiência | 1 | Zero atalhos de teclado, zero ações em lote, e "TV" não é um modo apesar de ser a cena principal |
| 8 | Estética e minimalismo | 2 | Wordmark ARCIL duplicado; ~40% do mural vazio com dados reais; coluna "Próximo passo" é texto constante |
| 9 | Recuperação de erro | 2 | `ConsoleError` imprime a string bruta do Supabase, sem ação de recuperação |
| 10 | Ajuda e documentação | 1 | Nenhum tooltip, legenda, estado vazio orientado ou onboarding |
| **Total** | | **20/40** | **Aceitável — melhorias significativas necessárias** |

## Design Specificity Verdict

**Avaliação LLM.** O mural `/` é autoral de verdade: split-flap graphite, divisórias de 1px, mono tabular, cor só como estado. Ninguém confunde com dashboard genérico de IA. O problema é que ele existe sozinho. `/leads`, `/cobranca`, `/agentes` e `/demanda-estoque` são um segundo produto (cards brancos arredondados, azul Apple, sombras suaves) e o `/login` é um terceiro (navy, gradiente, glow). A sidebar navy não pertence a nenhum dos três. Um visitante atravessando três telas vê três empresas.

**Scan determinístico.** 290 achados (289 advisory, 1 warning). 210 `design-system-font-size`, 79 `design-system-color`, 1 `bounce-easing`. Concentração: `app/login/page.tsx` (35), `app/globals.css` (29), `app/central-operational.module.css` (27), `app/atendimento/page.tsx` (21), `cobranca/_components/monitoramento-tab.tsx` (21). O detector confirma o que a inspeção visual mostrou: o DESIGN.md descreve o mural split-flap, e todo o resto do app está fora dele.

**Evidência de navegador.** Inspeção ao vivo em `localhost:3010` (desktop 1568px), tema claro e escuro, mais auditoria de contraste via JS na página.

## Overall Impression

O CRM funciona e o mural é bem desenhado. O que falta não é talento — é uma decisão. Existem três mundos visuais e nenhum deles foi eleito. A maior oportunidade é escolher um, tokenizá-lo e fazer o app inteiro obedecer; isso sozinho move consistência de 1 para 3 e desbloqueia tema, TV e acessibilidade de uma vez.

## What's Working

- **A gramática do mural.** Colunas fixas, ritmo de 47px, truncamento em vez de quebra, cor exclusivamente como estado. É disciplina real, não decoração.
- **Realtime honesto.** Quatro tabelas assinadas via `postgres_changes` e um relógio "AO VIVO" — o dado na tela é o dado no banco.
- **Comentários de código como memória de decisão.** `leads/page.tsx` e `cobranca/page.tsx` documentam por que cada regra existe. Raro e valioso.

## Priority Issues

**[P0] Montserrat quebrava o app inteiro** — *já corrigido nesta sessão*
`Montserrat({ weight: [...] })` pedia instâncias estáticas que o Google não serve mais (`.../JTU4jIg1…woff2` → 404). Toda rota devolvia 500. Removido o array `weight`; Montserrat é variable font e o eixo cobre 100–900.
Comando: n/a (bug fix)

**[P0] `ConsoleStatus` é invisível no tema claro**
Os tons usam `text-violet-300`/`text-emerald-300` sobre `bg-*-500/10` — calibrados para fundo escuro. Em `/leads` no tema claro o badge "IA" mede **1,45:1** de contraste e renderiza como um retângulo lavanda vazio. Afeta todo badge de status do app. Medido na página, não estimado.
Comando: `/impeccable audit`

**[P0] O tema claro é uma promessa falsa em `/`**
A sidebar oferece "Modo claro". `central-operational.module.css` codifica `#161719` e ~40 hex fixos. Clicar troca o rótulo para "Modo escuro" e não muda um pixel da página. Ou o mural passa a consumir tokens, ou o toggle some da rota.
Comando: `/impeccable harden`

**[P1] "FILAS ABERTAS 2659" é alarme fabricado**
2653 dos 2659 são "produtos sem estoque" — de um ERP que, segundo o próprio AGENTS.md, não envia quantidade. O número maior e mais destacado da tela é o menos verdadeiro. Fila real: 6.
Comando: `/impeccable clarify`

**[P1] Três sistemas visuais, dois `.dark` brigando**
`globals.css` define um `.dark` "Deep Space Console" na linha 60 e um segundo `.dark` "Broadcast Operations" na linha 364 que sobrescreve parte dele — o primeiro vira código morto parcial. `--sidebar-w-closed/open` e `.sidebar-root` existem mas a sidebar usa 244px fixo. O mural não usa token nenhum.
Comando: `/impeccable extract`

**[P1] A coluna "Próximo passo" é decoração**
"ACOMPANHAR DISTRIBUIÇÃO", "MONITORAR CONVERSAS", "CONFERIR DEMANDA" são strings constantes no `useMemo`. Nunca mudam com o estado. Uma coluna inteira do mural — a que promete ação — não carrega informação.
Comando: `/impeccable clarify`

## Persona Red Flags

**Alex (power user).** Nenhum atalho de teclado em todo o app. Nenhuma ação em lote em `/leads` com 300 registros carregados. Nenhuma linha do mural leva a lugar nenhum — ele lê "8 NA BASE" e precisa ir na sidebar, clicar Leads, e refiltrar à mão.

**Sam (dependente de acessibilidade).** Badge "IA" a 1,45:1 e avatar "PA" a 1,19:1 no tema claro. No mural, o strip "ESTADO ATUAL · RESPONSÁVEL · ÚLTIMO SINAL · PRÓXIMO PASSO" é 9px em `#787a7d` sobre `#191a1c` (~3,4:1) — e é redundante com os cabeçalhos reais 30px abaixo. Estado codificado só por cor, sem legenda.

**Paulo (dono, lendo TV a 2–3m).** O PRODUCT.md compromete "clareza à distância". O mural entrega rótulos de 9px e linhas de 11px. A `@media (max-width:820px)` esconde o `<h1>` e mantém só "ARCIL" — em TV, o oposto do necessário. Não existe preset de TV: sem fullscreen, sem escala, sem rotação de foco.

## Minor Observations

- **Wordmark ARCIL duplicado** — sidebar e masthead do mural, lado a lado, na mesma tela.
- **Feed de eventos mostra só HH:mm** num feed multi-dia. A ordenação está correta (timestamp completo em `getRecentActivity`), mas a tela mostra 17:29 → 14:36 → 19:28 e parece bug. Falta a data quando o evento não é de hoje.
- **Quatro zeros seguidos no ledger** (follow-ups, qualificados, propostas, vendas). Sem estado vazio desenhado, lê-se como sistema quebrado.
- **~40% do mural vazio** com o volume real de dados. A agenda tem 6 linhas fixas num painel dimensionado para ~20.
- **Colunas Kanban vazias com ~600px de altura** em `/leads` — 3 de 5 vazias no dado atual.
- **`page.tsx` do dashboard escrito em linhas de 1.000+ caracteres** — JSX inteiro numa linha por seção. Impossível revisar em diff.
- **`ConsoleError`** imprime `error.message` do Supabase direto (ex.: "JWT expired") sem tradução nem ação.

## Questions to Consider

- Se o mural é feito para TV, por que ele vive dentro do layout de app com sidebar de 244px em vez de ter uma rota `/tv` sem cromo?
- O que aconteceria se cada linha da agenda fosse um link para a superfície de trabalho já filtrada?
- "Filas abertas" deveria contar coisas que ninguém vai tratar hoje?
- Qual dos três mundos visuais é o ARCIL — e os outros dois deveriam existir?
