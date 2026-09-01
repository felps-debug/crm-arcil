# Prévia Técnica — Desenho Técnico (Gemini + vetorial fixo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o layout `camadaAncorada` (V1, cards escuros opacos + linha diagonal pontilhada) pelo estilo "Desenho Técnico" validado em 7 rodadas de teste real contra o Gemini 3 Pro Image: linha de chamada ortogonal fina, callouts (EVAPORADORA, FORRO ATÉ LAJE+cota, LIGAÇÃO ATÉ CONDENSADORA, FLUXO DE AR) desenhados pelo próprio Gemini quando `modoInfra === "gemini_3d"`, e MODELO + DETALHES DA INSTALAÇÃO + logo + QR + rodapé legal sempre vetoriais (satori), sem card/caixa atrás do texto.

**Architecture:** `preview-annotations.ts` para de desenhar callouts vetoriais quando `modoInfra === "gemini_3d"` (o Gemini já desenhou isso na cena, via prompt novo do n8n) — sai cedo com plano vazio. `installation-overlay.ts` continua compondo por cima: MODELO e DETALHES DA INSTALAÇÃO como texto solto com sombra (sem `background`/`border`), logo em tom cinza translúcido com legenda "Created by ARCIL AI", QR num card branco arredondado, selo de aprovação removido. O modo `vetorial` (rollback via `INFRA_VISUAL=vetorial`) continua desenhando os callouts como sempre desenhou — nada muda nesse caminho.

**Tech Stack:** Next.js 16, TypeScript, satori (SVG → PNG via fonte Montserrat local), sharp, Vitest.

---

## Contexto para quem for implementar

Todo o design abaixo foi validado com 7 gerações reais contra a API do Gemini 3 Pro Image (fora deste repo, num ambiente de teste isolado) — não é especulação de design, é o que já rodou e foi aprovado pelo dono do produto. O prompt final testado (que vai pro nó `GERADOR DE PROMPT2` do n8n, fora deste repositório) está documentado na Tarefa 7.

Regra que não muda (documentada em `AGENTS.md`, seção "Divisão de responsabilidade — não quebrar"): o Gemini nunca desenha SKU, nome de produto, logo ou QR — só o que é espacial/ancorado na cena (callouts, cota, raio-x da infra). Isso já causou erro real em teste ("Spllt" no lugar de "Split") e é por isso que MODELO fica vetorial.

## File Structure

- Modify: `src/constants/arcil-brand.ts` — novos tokens de linha ortogonal.
- Modify: `src/lib/server/satori-nodes.ts` — variante cinza/translúcida da logo.
- Modify: `src/lib/server/previa-tipos.ts` — campo novo `tipoForro`.
- Modify: `src/app/api/generate-image/route.ts` — coleta `tipo_forro` da resposta do vendedor.
- Modify: `src/lib/server/preview-annotations.ts` — linha ortogonal, early-return em `gemini_3d`.
- Modify: `src/lib/server/installation-overlay.ts` — remove selo, MODELO/DETALHES sem caixa, logo cinza+legenda, QR em card branco.
- Modify: `src/lib/server/installation-overlay.test.ts` — novo caso de teste `modoInfra: "gemini_3d"`.

---

### Task 1: Tokens de linha ortogonal em `arcil-brand.ts`

**Files:**
- Modify: `src/constants/arcil-brand.ts`

- [ ] **Step 1: Adicionar os tokens do "Desenho Técnico" logo depois do bloco `SOMBRA_TEXTO`/`SOMBRA_TITULO` (depois da linha 50)**

```typescript
/**
 * "Desenho Técnico" — linha de chamada ortogonal usada quando `modoInfra` é
 * `gemini_3d` e o próprio Gemini desenha os callouts na cena, ou pelo modo
 * `vetorial` de fallback. Branco/quase-branco só, sem cor de marca na linha —
 * mesma técnica já validada em `cassette-commercial-layout.ts`
 * (`chamadaOrtogonal`), generalizada aqui.
 */
export const TRACO_ORTOGONAL = "rgba(255,255,255,0.85)";
export const TRACO_ORTOGONAL_PONTO = "#FFFFFF";
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/arcil-brand.ts
git commit -m "feat: tokens de linha ortogonal para o layout Desenho Técnico"
```

---

### Task 2: Logo cinza translúcida em `satori-nodes.ts`

**Files:**
- Modify: `src/lib/server/satori-nodes.ts`

O logo grande (`logoArcil()`) hoje é usado a 92% de opacidade, cor original (azul institucional). O novo tratamento é cinza dessaturado, mais discreto — testado e aprovado. `sharp` já é dependência do projeto (usado em `installation-overlay.ts`).

- [ ] **Step 1: Adicionar `logoArcilClaro()` depois de `logoArcil()` (depois da linha 66)**

```typescript
import sharp from "sharp";

/** Variante cinza/dessaturada da logo — usada no rodapé fixo do layout
 *  "Desenho Técnico", mais discreta que a cor institucional cheia.
 *  Processada uma vez com `sharp` e cacheada em base64, igual `logoArcil()`. */
let logoClaroCache: string | null = null;
export async function logoArcilClaro(): Promise<string | null> {
  if (logoClaroCache === null) {
    try {
      const bytes = fs.readFileSync(path.join(process.cwd(), "public", "logo-arcil-full.png"));
      const cinza = await sharp(bytes).greyscale().toBuffer();
      logoClaroCache = "data:image/png;base64," + cinza.toString("base64");
    } catch (err) {
      console.error("[satori-nodes] logo cinza indisponível:", err instanceof Error ? err.message : err);
      logoClaroCache = "";
    }
  }
  return logoClaroCache || null;
}
```

- [ ] **Step 2: Verificar que o projeto builda (typecheck) antes de seguir**

Run: `npm run build -- --no-lint` (ou `npx tsc --noEmit` se preferir só o typecheck)
Expected: sem erro em `satori-nodes.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/satori-nodes.ts
git commit -m "feat: variante cinza da logo institucional para o rodapé fixo"
```

---

### Task 3: Campo `tipoForro` em `DadosOverlay`

**Files:**
- Modify: `src/lib/server/previa-tipos.ts`

`DETALHES DA INSTALAÇÃO` (Task 6) precisa mostrar o tipo de forro (Gesso/PVC/Modular) que o vendedor respondeu — hoje esse dado é coletado (`buildSteps` pergunta `tipo_forro` pra Cassete e Dutado, em `src/app/chatbot/page.tsx:186` e `:200`) mas **nunca chega em `DadosOverlay`**. Sem esse campo o card fica sem essa linha mesmo com a resposta salva no banco.

- [ ] **Step 1: Adicionar o campo depois de `alcapao` (linha 20)**

```typescript
  alcapao: boolean | null;
  /** "Gesso" | "PVC" | "Modular" | "Outro" — resposta do vendedor pra
   *  Cassete/Dutado. Vira linha no card DETALHES DA INSTALAÇÃO. */
  tipoForro: string | null;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/previa-tipos.ts
git commit -m "feat: campo tipoForro em DadosOverlay"
```

(O build vai quebrar até a Task 4 preencher esse campo em `route.ts` e a Task 6 atualizar o literal do teste — normal nesse ponto do plano, cada task deixa o build passando de novo.)

---

### Task 4: Coletar `tipo_forro` em `route.ts`

**Files:**
- Modify: `src/app/api/generate-image/route.ts:242-244`
- Modify: `src/app/api/generate-image/route.ts:546-549`

- [ ] **Step 1: Coletar a resposta, ao lado de `alcapao` (linha 243)**

Old:
```typescript
  if (answers?.tipo_parede) collectedData.tipo_parede = answers.tipo_parede;
  if (answers?.alcapao) collectedData.alcapao = answers.alcapao === "Sim";
```

New:
```typescript
  if (answers?.tipo_parede) collectedData.tipo_parede = answers.tipo_parede;
  if (answers?.tipo_forro) collectedData.tipo_forro = answers.tipo_forro;
  if (answers?.alcapao) collectedData.alcapao = answers.alcapao === "Sim";
```

- [ ] **Step 2: Passar pro `DadosOverlay`, ao lado de `alcapao` (linha 548)**

Old:
```typescript
    alcapao: typeof collectedData.alcapao === "boolean" ? collectedData.alcapao : null,
    metragemInfra: typeof collectedData.metragem_infra === "string" ? metragemLegivel(collectedData.metragem_infra) : null,
```

New:
```typescript
    alcapao: typeof collectedData.alcapao === "boolean" ? collectedData.alcapao : null,
    tipoForro: typeof collectedData.tipo_forro === "string" ? collectedData.tipo_forro : null,
    metragemInfra: typeof collectedData.metragem_infra === "string" ? metragemLegivel(collectedData.metragem_infra) : null,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro (o campo `tipoForro` obrigatório de `DadosOverlay`, adicionado na Task 3, agora está preenchido aqui)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/generate-image/route.ts
git commit -m "feat: coleta resposta de tipo de forro pro card de detalhes da instalação"
```

---

### Task 5: Linha ortogonal + early-return em `gemini_3d` — `preview-annotations.ts`

**Files:**
- Modify: `src/lib/server/preview-annotations.ts`
- Test: `src/lib/server/installation-overlay.test.ts` (roda no fim, via `comporPrevia`)

Hoje `planoAnotacoes()` desenha os callouts (EVAPORADORA, cota, LIGAÇÃO ATÉ CONDENSADORA, FORRO ATÉ LAJE/DISTÂNCIA DO TETO, FLUXO DE AR) **sempre**, com linha pontilhada diagonal (`linhaChamada`, linha 52-57). Isso já é gated corretamente para o feixe de infra (`feixeInfra`, linha 542) e a cota do pé-direito (linha 670) — mas não pros callouts em si. Com o prompt novo do Gemini (Task 7) desenhando esses mesmos callouts direto na cena quando `modoInfra === "gemini_3d"`, sem gate aqui o resultado sai com **texto duplicado**: o do Gemini na foto e o vetorial por cima, desalinhados.

- [ ] **Step 1: Trocar `linhaChamada`/`marcador` por uma função ortogonal, logo abaixo de `marcador` (depois da linha 61)**

```typescript
import { TRACO_ORTOGONAL, TRACO_ORTOGONAL_PONTO } from "@/constants/arcil-brand";

/**
 * Linha de chamada ortogonal: sai do texto na horizontal, dobra uma vez,
 * desce/sobe até o ponto. Substitui a diagonal pontilhada (`linhaChamada`) —
 * mesma técnica já validada em `cassette-commercial-layout.ts`
 * (`chamadaOrtogonal`), generalizada pro layout ancorado padrão.
 */
function chamadaOrtogonal(de: Ponto, para: Ponto): string {
  const d = `M ${de.x.toFixed(1)} ${de.y.toFixed(1)} L ${para.x.toFixed(1)} ${de.y.toFixed(1)} L ${para.x.toFixed(1)} ${para.y.toFixed(1)}`;
  return (
    `<path d="${d}" fill="none" stroke="${TRACO_ORTOGONAL}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${para.x.toFixed(1)}" cy="${para.y.toFixed(1)}" r="3.5" fill="${TRACO_ORTOGONAL_PONTO}" stroke="#0b1220" stroke-width="1"/>`
  );
}
```

- [ ] **Step 2: Atualizar o import do topo do arquivo (linha 4) pra incluir os dois tokens novos**

Old:
```typescript
import { AZUL, CLARO, CINZA, INFRA, ORDEM_INFRA, SOMBRA_TEXTO, FAIXA } from "@/constants/arcil-brand";
```

New:
```typescript
import { AZUL, CLARO, CINZA, INFRA, ORDEM_INFRA, SOMBRA_TEXTO, FAIXA, TRACO_ORTOGONAL, TRACO_ORTOGONAL_PONTO } from "@/constants/arcil-brand";
```

(Remova o `import` duplicado adicionado no Step 1 — ele foi só pra mostrar de onde vêm os tokens; a importação real fica centralizada nesta linha 4.)

- [ ] **Step 3: Trocar a chamada final de linha/marcador (linhas 711-721) pra usar `chamadaOrtogonal`**

Old:
```typescript
  // Linhas de chamada por último, quando todas as posições finais já existem.
  for (const c of callouts) {
    if (!c.alvo) continue;
    const alturaEstimada = c.corpo ? 48 * escala : 20 * escala;
    const saida = saidaDoCallout(c, alturaEstimada);
    // Chamada curta demais vira um risco solto ao lado do texto; nesse caso o
    // próprio encostamento já diz a que o callout se refere.
    if (Math.hypot(saida.x - c.alvo.x, saida.y - c.alvo.y) < W * 0.03) continue;
    linhas.push(linhaChamada(saida, c.alvo));
    linhas.push(marcador(c.alvo, c.cor === CLARO ? AZUL : c.cor));
  }
```

New:
```typescript
  // Linhas de chamada por último, quando todas as posições finais já existem.
  for (const c of callouts) {
    if (!c.alvo) continue;
    const alturaEstimada = c.corpo ? 48 * escala : 20 * escala;
    const saida = saidaDoCallout(c, alturaEstimada);
    // Chamada curta demais vira um risco solto ao lado do texto; nesse caso o
    // próprio encostamento já diz a que o callout se refere.
    if (Math.hypot(saida.x - c.alvo.x, saida.y - c.alvo.y) < W * 0.03) continue;
    linhas.push(chamadaOrtogonal(saida, c.alvo));
  }
```

- [ ] **Step 4: Remover `linhaChamada` e `marcador`, agora sem uso (linhas 52-61)**

Old:
```typescript
function linhaChamada(de: Ponto, para: Ponto): string {
  return (
    `<line x1="${de.x.toFixed(1)}" y1="${de.y.toFixed(1)}" x2="${para.x.toFixed(1)}" y2="${para.y.toFixed(1)}" ` +
    `stroke="rgba(242,246,252,0.8)" stroke-width="1.3" stroke-dasharray="2 4" stroke-linecap="round"/>`
  );
}

function marcador(p: Ponto, cor: string): string {
  return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${cor}" stroke="#0b1220" stroke-width="1.2"/>`;
}
```

New: (deletar as duas funções — sem substituto direto, `chamadaOrtogonal` já inclui o ponto)

- [ ] **Step 5: Early-return em `planoAnotacoes` quando `gemini_3d` — logo no topo da função (depois da linha 456, antes de montar `caixa`)**

Old:
```typescript
export function planoAnotacoes(d: DadosOverlay, m: Marcacao, W: number, H: number, ladoTexto: 1 | -1): PlanoAnotacoes {
  const familia = familiaDe(d.tipoEquipamento);
  const escala = Math.min(W, H) / 1024;

  const caixa: Caixa = {
```

New:
```typescript
export function planoAnotacoes(d: DadosOverlay, m: Marcacao, W: number, H: number, ladoTexto: 1 | -1): PlanoAnotacoes {
  // Em `gemini_3d` o Gemini já desenhou EVAPORADORA, cota, LIGAÇÃO ATÉ
  // CONDENSADORA, FORRO ATÉ LAJE e FLUXO DE AR direto na cena (prompt do
  // n8n) -- desenhar de novo aqui duplicaria o texto, desalinhado com o que
  // já está na foto. Esta função só roda de verdade no modo `vetorial`
  // (rollback via INFRA_VISUAL=vetorial).
  if (d.modoInfra === "gemini_3d") return { linhas: "", nos: [] };

  const familia = familiaDe(d.tipoEquipamento);
  const escala = Math.min(W, H) / 1024;

  const caixa: Caixa = {
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro (confira que `AZUL` continua importado e usado em outro lugar do arquivo — `feixeInfra`/`fantasmaGabinete` ainda o referenciam; se o compilador acusar import não usado em algum token, remova só o que sobrou sem uso)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/preview-annotations.ts
git commit -m "feat: linha de chamada ortogonal e early-return quando o Gemini desenha os callouts"
```

---

### Task 6: MODELO/DETALHES sem caixa, logo cinza, QR em card, sem selo — `installation-overlay.ts`

**Files:**
- Modify: `src/lib/server/installation-overlay.ts`

- [ ] **Step 1: Trocar o import do topo (linhas 8-20) — remove `SELO_APROVACAO` (função que o usa sai no Step 4), adiciona `TRACO_ORTOGONAL`**

Old:
```typescript
import {
  AZUL,
  CLARO,
  CINZA,
  CARD_FUNDO,
  CARD_BORDA,
  CARD_RAIO,
  SOMBRA_TEXTO,
  SOMBRA_TITULO,
  FAIXA,
  RODAPE_LEGAL,
  SELO_APROVACAO,
} from "@/constants/arcil-brand";
```

New:
```typescript
import {
  AZUL,
  CLARO,
  CINZA,
  CARD_FUNDO,
  CARD_BORDA,
  CARD_RAIO,
  SOMBRA_TEXTO,
  SOMBRA_TITULO,
  FAIXA,
  RODAPE_LEGAL,
} from "@/constants/arcil-brand";
```

- [ ] **Step 2: Trocar o import de `satori-nodes` (linha 4) pra incluir `logoArcilClaro`**

Old:
```typescript
import { el, img, b64svg, fontes, logoArcil, type No } from "./satori-nodes";
```

New:
```typescript
import { el, img, b64svg, fontes, logoArcil, logoArcilClaro, type No } from "./satori-nodes";
```

- [ ] **Step 3: Reescrever `logoNo` (linhas 131-143) — vira `async`, cinza, com legenda "Created by ARCIL AI"**

Old:
```typescript
/** Logo grande no canto inferior esquerdo, como na referência aprovada. O
 *  selo pequeno "Design created by ARCIL AI" continua sendo aplicado depois,
 *  fora daqui (`route.ts`), no canto superior direito. */
function logoNo(W: number, H: number): No | null {
  const src = logoArcil();
  if (!src) return null;
  const largura = Math.round(W * 0.13);
  return el(
    "div",
    { position: "absolute", left: Math.round(W * FAIXA.margemFrac), top: Math.round(H - H * 0.075), opacity: 0.92 },
    img(src, { width: largura, height: Math.round(largura * 0.28), objectFit: "contain" })
  );
}
```

New:
```typescript
/** Logo no canto inferior esquerdo — cinza translúcida com legenda, mais
 *  discreta que a cor institucional cheia. Testado e aprovado no layout
 *  "Desenho Técnico": marca presente sem competir com a foto do cliente. */
async function logoNo(W: number, H: number): Promise<No | null> {
  const src = await logoArcilClaro();
  if (!src) return null;
  const largura = Math.round(W * 0.115);
  const altura = Math.round(largura * 0.28);
  return el(
    "div",
    { position: "absolute", left: Math.round(W * FAIXA.margemFrac), top: Math.round(H - H * 0.075 - altura), flexDirection: "column", opacity: 0.72 },
    img(src, { width: largura, height: altura, objectFit: "contain" }),
    el("div", { fontSize: 8, fontStyle: "italic", color: "rgba(255,255,255,0.75)", marginTop: 2 }, "Created by ARCIL AI")
  );
}
```

- [ ] **Step 4: Remover `seloAprovacaoNo` (linhas 172-199) — função inteira, sem substituto**

Old: (deletar as linhas 172-199, a função `seloAprovacaoNo` completa)

New: (nada — a função sai)

- [ ] **Step 5: Reescrever `cardModeloNo` (linhas 201-230) — sem `background`/`border`/`borderRadius`/`padding`, texto solto com sombra**

Old:
```typescript
/** Card MODELO: o dado que o cliente mais olha, exatamente com o valor que o
 *  vendedor escolheu no catálogo do ERP — nunca reescrito por IA. */
function cardModeloNo(d: DadosOverlay, largura: number): No {
  // Sem repetir a marca quando o nome de catálogo do ERP já começa por ela —
  // "SPRINGER MIDEA SPLIT CASSETE ... SPRINGER MIDEA" saiu assim na primeira
  // prévia real.
  const nome = d.produto.trim();
  const marca = (d.marca ?? "").trim();
  const linhaProduto = marca && !nome.toUpperCase().startsWith(marca.toUpperCase()) ? `${marca} ${nome}` : nome;
  return el(
    "div",
    {
      width: largura,
      flexDirection: "column",
      background: CARD_FUNDO,
      border: `1px solid ${CARD_BORDA}`,
      borderRadius: CARD_RAIO,
      padding: "11px 14px",
    },
    el("div", { fontSize: 11, fontWeight: 700, color: CLARO, letterSpacing: 0.9 }, "MODELO:"),
    el("div", { fontSize: 12, color: CLARO, marginTop: 4, lineHeight: 1.35, width: largura - 28 }, linhaProduto || d.produto),
    d.capacidade || d.sku
      ? el(
          "div",
          { fontSize: 10.5, color: CINZA, marginTop: 3 },
          [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · ")
        )
      : null
  );
}
```

New:
```typescript
/** MODELO: o dado que o cliente mais olha, exatamente com o valor que o
 *  vendedor escolheu no catálogo do ERP — nunca reescrito por IA. Texto
 *  solto com sombra, sem caixa/card atrás — mesma linguagem visual dos
 *  callouts do Gemini, testado e aprovado. */
function cardModeloNo(d: DadosOverlay, largura: number): No {
  // Sem repetir a marca quando o nome de catálogo do ERP já começa por ela —
  // "SPRINGER MIDEA SPLIT CASSETE ... SPRINGER MIDEA" saiu assim na primeira
  // prévia real.
  const nome = d.produto.trim();
  const marca = (d.marca ?? "").trim();
  const linhaProduto = marca && !nome.toUpperCase().startsWith(marca.toUpperCase()) ? `${marca} ${nome}` : nome;
  return el(
    "div",
    { width: largura, flexDirection: "column" },
    el("div", { fontSize: 11, fontWeight: 700, color: CLARO, letterSpacing: 0.9, textShadow: SOMBRA_TEXTO }, "MODELO"),
    el("div", { fontSize: 12, fontWeight: 700, color: CLARO, marginTop: 4, lineHeight: 1.35, width: largura - 14, textShadow: SOMBRA_TEXTO }, linhaProduto || d.produto),
    d.capacidade || d.sku
      ? el(
          "div",
          { fontSize: 10.5, color: CINZA, marginTop: 3, textShadow: SOMBRA_TEXTO },
          [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · ")
        )
      : null
  );
}
```

- [ ] **Step 6: Adicionar `detalhesInstalacaoNo`, logo depois do novo `cardModeloNo`**

```typescript
/** DETALHES DA INSTALAÇÃO: respostas específicas do lead que hoje eram
 *  coletadas mas não apareciam em lugar nenhum da prévia final quando havia
 *  marcação (só apareciam no layout de cards, sem marcação). Texto solto com
 *  sombra, mesma regra do MODELO — sem caixa. Cada linha só entra se o dado
 *  existir para aquele tipo de equipamento (mesma lógica condicional de
 *  `especificacoes()`, no layout de cards). */
function detalhesInstalacaoNo(d: DadosOverlay, largura: number): No | null {
  const t = d.tipoEquipamento.trim().toLowerCase();
  const linhas: string[] = [];

  if (d.tipoForro) linhas.push(`Forro: ${d.tipoForro}`);
  if (t === "cassete" && d.alcapao != null) linhas.push(`Alçapão de inspeção: ${d.alcapao ? "incluso" : "não incluso"}`);
  if (d.pontoEletrico != null) linhas.push(`Ponto elétrico: ${d.pontoEletrico ? "já existe" : "a executar"}`);
  if (d.tubulacao) linhas.push(`Tubulação e dreno: ${d.tubulacao.toLowerCase()}${d.metragemInfra ? ` (≈ ${d.metragemInfra})` : ""}`);
  else if (d.metragemInfra) linhas.push(`Tubulação e dreno: ≈ ${d.metragemInfra}`);

  if (linhas.length === 0) return null;

  return el(
    "div",
    { width: largura, flexDirection: "column" },
    el("div", { fontSize: 11, fontWeight: 700, color: CLARO, letterSpacing: 0.9, textShadow: SOMBRA_TEXTO, marginBottom: 5 }, "DETALHES DA INSTALAÇÃO"),
    ...linhas.map((texto) =>
      el("div", { fontSize: 10.5, color: CINZA, lineHeight: 1.5, textShadow: SOMBRA_TEXTO }, `- ${texto}`)
    )
  );
}
```

- [ ] **Step 7: Reescrever `qrNo` (linhas 145-170) — card branco arredondado, rótulo mais curto**

Old:
```typescript
function qrNo(dataUrl: string | null, W: number, H: number, ehManual: boolean): No | null {
  if (!dataUrl) return null;
  const lado = Math.round(W * 0.055);
  const largura = lado + Math.round(W * 0.075);
  return el(
    "div",
    {
      position: "absolute",
      left: Math.round(W - W * FAIXA.margemFrac - largura),
      top: Math.round(H - H * 0.085),
      width: largura,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    el(
      "div",
      { flexDirection: "column", alignItems: "flex-end", marginRight: 8, width: largura - lado - 8 },
      el(
        "div",
        { fontSize: 9.5, color: CLARO, textShadow: SOMBRA_TEXTO, textAlign: "right", lineHeight: 1.25 },
        ehManual ? "Escaneie para acessar o manual" : "Escaneie para conhecer a ARCIL"
      )
    ),
    img(dataUrl, { width: lado, height: lado, borderRadius: 4 })
  );
}
```

New:
```typescript
/** QR num card branco arredondado — mais legível sobre foto de qualquer
 *  tom que o "flutuando direto na cena" do layout anterior. Rótulo curto,
 *  uma linha só. */
function qrNo(dataUrl: string | null, W: number, H: number, ehManual: boolean): No | null {
  if (!dataUrl) return null;
  const lado = Math.round(W * 0.05);
  const pad = 8;
  const cartao = lado + pad * 2;
  const largura = cartao + Math.round(W * 0.09);
  return el(
    "div",
    {
      position: "absolute",
      left: Math.round(W - W * FAIXA.margemFrac - largura),
      top: Math.round(H - H * 0.075 - cartao),
      width: largura,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    el(
      "div",
      { fontSize: 9, color: CLARO, textShadow: SOMBRA_TEXTO, textAlign: "right", marginRight: 8, width: largura - cartao - 8 },
      ehManual ? "Manual de instalação" : "Conheça a ARCIL"
    ),
    el(
      "div",
      { width: cartao, height: cartao, background: "#FFFFFF", borderRadius: 10, alignItems: "center", justifyContent: "center" },
      img(dataUrl, { width: lado, height: lado })
    )
  );
}
```

- [ ] **Step 8: Atualizar `camadaAncorada` (linhas 275-335) — remove selo, adiciona DETALHES, `logoNo` fica `await`**

Old:
```typescript
function camadaAncorada(d: DadosOverlay, W: number, H: number, qrDataUrl: string | null): No {
  // `d.marcacao` foi verificado por quem chama; o `!` aqui é o preço de manter
  // a checagem num lugar só em vez de espalhar guardas equivalentes.
  const marcacao = d.marcacao!;
  const margem = Math.round(W * FAIXA.margemFrac);
  const larguraCard = Math.round(W * 0.21);

  // UMA decisão de espelhamento para a imagem inteira: a coluna de cards
  // (legenda, painel da condensadora, modelo) fica do lado com mais espaço
  // livre em relação ao aparelho, e os callouts flutuantes vão para o lado
  // oposto. Quando cada grupo escolhia o próprio lado, com o aparelho marcado
  // perto de uma borda os dois caíam no mesmo canto, um por cima do outro.
  const centroCaixa = marcacao.caixa.x + marcacao.caixa.w / 2;
  const cardsNaDireita = centroCaixa <= 0.55;
  const xCards = cardsNaDireita ? W - margem - larguraCard : margem;
  const ladoTexto: 1 | -1 = cardsNaDireita ? -1 : 1;

  const plano = planoAnotacoes(d, marcacao, W, H, ladoTexto);

  // O selo "Design created by ARCIL AI" é composto depois, colado no topo
  // direito (route.ts). A coluna começa abaixo dele — na primeira prévia real a
  // legenda saiu por baixo do selo.
  const topoCards = Math.max(Math.round(H * 0.05), 64);

  return el(
    "div",
    {
      width: W,
      height: H,
      position: "relative",
      fontFamily: "Montserrat",
      // Véu suave só nas pontas: o miolo da cena — o que o cliente quer ver —
      // fica sem filtro, e o texto se sustenta pela sombra própria.
      backgroundImage:
        "linear-gradient(to bottom, rgba(4,9,18,0.5) 0%, rgba(4,9,18,0.16) 12%, rgba(4,9,18,0) 22%," +
        " rgba(4,9,18,0) 68%, rgba(4,9,18,0.42) 84%, rgba(4,9,18,0.78) 100%)",
    },
    img(svgDasLinhas(plano.linhas, W, H), { position: "absolute", left: 0, top: 0, width: W, height: H }),
    ...plano.nos,
    // UMA coluna de verdade, não três blocos posicionados em `top` calculado a
    // dedo. O painel do equipamento muda de altura conforme tenha ou não foto
    // do produto, então qualquer `top` fixo para o card seguinte acerta num
    // caso e sobrepõe no outro — foi exatamente o que aconteceu na primeira
    // prévia real. Com flex column + gap o empilhamento é do layout.
    el(
      "div",
      { position: "absolute", left: xCards, top: topoCards, width: larguraCard, flexDirection: "column", gap: 12 },
      // Legenda de cores só faz sentido explicando o feixe vetorial que nós
      // desenhamos. Em `gemini_3d` a tubulação sai em cobre/conduíte reais, e
      // uma legenda de cores não corresponde a nada na imagem.
      d.modoInfra !== "gemini_3d" ? legendaInfraNo(larguraCard) : null,
      painelCondensadoraNo(d, larguraCard, CARD_FUNDO, CARD_BORDA, CARD_RAIO),
      cardModeloNo(d, larguraCard)
    ),
    cardLembretesNo(d, W - margem - Math.round(W * 0.235), Math.round(H * 0.7), Math.round(W * 0.235)),
    seloAprovacaoNo(W, H),
    logoNo(W, H),
    qrNo(qrDataUrl, W, H, d.qrEhManual === true),
    rodapeLegalNo(W, H)
  );
}
```

New:
```typescript
async function camadaAncorada(d: DadosOverlay, W: number, H: number, qrDataUrl: string | null): Promise<No> {
  // `d.marcacao` foi verificado por quem chama; o `!` aqui é o preço de manter
  // a checagem num lugar só em vez de espalhar guardas equivalentes.
  const marcacao = d.marcacao!;
  const margem = Math.round(W * FAIXA.margemFrac);
  const larguraCard = Math.round(W * 0.21);

  // UMA decisão de espelhamento para a imagem inteira: a coluna de cards
  // (legenda, painel da condensadora, modelo, detalhes) fica do lado com mais
  // espaço livre em relação ao aparelho, e os callouts (do Gemini, quando
  // `gemini_3d`, ou vetoriais no modo de fallback) ficam no lado oposto.
  const centroCaixa = marcacao.caixa.x + marcacao.caixa.w / 2;
  const cardsNaDireita = centroCaixa <= 0.55;
  const xCards = cardsNaDireita ? W - margem - larguraCard : margem;
  const ladoTexto: 1 | -1 = cardsNaDireita ? -1 : 1;

  // Em `gemini_3d` isto devolve plano vazio (ver `planoAnotacoes`) — os
  // callouts já estão na cena, desenhados pelo Gemini.
  const plano = planoAnotacoes(d, marcacao, W, H, ladoTexto);

  const topoCards = Math.max(Math.round(H * 0.05), 64);
  const logo = await logoNo(W, H);

  return el(
    "div",
    {
      width: W,
      height: H,
      position: "relative",
      fontFamily: "Montserrat",
      // Véu suave só nas pontas: o miolo da cena — o que o cliente quer ver —
      // fica sem filtro, e o texto se sustenta pela sombra própria.
      backgroundImage:
        "linear-gradient(to bottom, rgba(4,9,18,0.5) 0%, rgba(4,9,18,0.16) 12%, rgba(4,9,18,0) 22%," +
        " rgba(4,9,18,0) 68%, rgba(4,9,18,0.42) 84%, rgba(4,9,18,0.78) 100%)",
    },
    img(svgDasLinhas(plano.linhas, W, H), { position: "absolute", left: 0, top: 0, width: W, height: H }),
    ...plano.nos,
    // UMA coluna de verdade, não blocos posicionados em `top` calculado a
    // dedo. O painel do equipamento muda de altura conforme tenha ou não foto
    // do produto, então qualquer `top` fixo para o próximo card acerta num
    // caso e sobrepõe no outro. Com flex column + gap o empilhamento é do
    // layout.
    el(
      "div",
      { position: "absolute", left: xCards, top: topoCards, width: larguraCard, flexDirection: "column", gap: 14 },
      // Legenda de cores só faz sentido explicando o feixe vetorial que nós
      // desenhamos. Em `gemini_3d` a tubulação sai em cobre/conduíte reais, e
      // uma legenda de cores não corresponde a nada na imagem.
      d.modoInfra !== "gemini_3d" ? legendaInfraNo(larguraCard) : null,
      painelCondensadoraNo(d, larguraCard, CARD_FUNDO, CARD_BORDA, CARD_RAIO),
      cardModeloNo(d, larguraCard),
      detalhesInstalacaoNo(d, larguraCard)
    ),
    logo,
    qrNo(qrDataUrl, W, H, d.qrEhManual === true),
    rodapeLegalNo(W, H)
  );
}
```

- [ ] **Step 9: `camadaAncorada` agora é `async` — atualizar quem chama, em `comporPrevia` (linhas 561-565)**

Old:
```typescript
  const arvore = usaV2
    ? await camadaCassetteV2(dados, largura, altura)
    : dados.marcacao
      ? camadaAncorada(dados, largura, altura, await qrDataUrl(dados.urlPrevia))
      : camadaCards(dados, largura, altura);
```

New:
```typescript
  const arvore = usaV2
    ? await camadaCassetteV2(dados, largura, altura)
    : dados.marcacao
      ? await camadaAncorada(dados, largura, altura, await qrDataUrl(dados.urlPrevia))
      : camadaCards(dados, largura, altura);
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro. Se `CARD_FUNDO`/`CARD_BORDA`/`CARD_RAIO` acusarem import não usado (só `painelCondensadoraNo` ainda os usa, como parâmetro — confira antes de remover), ajuste o import; eles continuam em uso por `painelCondensadoraNo` e `cartao`/`camadaCards` mais abaixo no arquivo, então **não devem ser removidos**.

- [ ] **Step 11: Commit**

```bash
git add src/lib/server/installation-overlay.ts
git commit -m "feat: layout Desenho Técnico — MODELO/detalhes sem caixa, logo cinza, QR em card, sem selo"
```

---

### Task 7: Testar o novo caminho `gemini_3d`

**Files:**
- Modify: `src/lib/server/installation-overlay.test.ts`

O arquivo já tem um caso `COM_MARCACAO` sem `modoInfra` definido (exercita o modo `vetorial`, já que `undefined !== "gemini_3d"`). Falta um caso explícito `gemini_3d` — é o caminho que este plano inteiro muda.

- [ ] **Step 1: Adicionar o campo `tipoForro` ao fixture `BASE` (linha 43, ao lado de `alcapao`)**

Old:
```typescript
  pontoEletrico: false,
  alcapao: true,
  metragemInfra: "6 m",
```

New:
```typescript
  pontoEletrico: false,
  alcapao: true,
  tipoForro: "Gesso",
  metragemInfra: "6 m",
```

- [ ] **Step 2: Escrever o teste novo, depois do teste "cai no layout de cards" (depois da linha 118, antes do fechamento do `describe`)**

```typescript
  it("compõe a camada ancorada em modoInfra=gemini_3d sem desenhar callout vetorial duplicado", async () => {
    const meta = await render("ancorado-gemini3d", { ...COM_MARCACAO, modoInfra: "gemini_3d" }, 1536, 864);
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(864);
  }, 30_000);
```

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run src/lib/server/installation-overlay.test.ts`
Expected: 4 testes passando (os 3 já existentes + o novo)

- [ ] **Step 4: Inspecionar visualmente com `PREVIA_DUMP`**

Run: `PREVIA_DUMP=/tmp/previa-dump npx vitest run src/lib/server/installation-overlay.test.ts`

Abra `/tmp/previa-dump/ancorado-gemini3d.png` e confira:
- Nenhum callout vetorial (EVAPORADORA, FORRO ATÉ LAJE etc.) desenhado — a cena sintética (gradiente) não tem texto nenhum vindo do Gemini, então esse PNG deve mostrar SÓ os elementos vetoriais: MODELO, DETALHES DA INSTALAÇÃO, logo cinza + legenda, QR em card branco, rodapé legal. Sem selo.
- Compare com `ancorado-cassete.png` (modo `vetorial`, sem `modoInfra`) — esse SIM deve mostrar os callouts com linha ortogonal nova (não mais diagonal pontilhada).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/installation-overlay.test.ts
git commit -m "test: cobre modoInfra=gemini_3d sem callout vetorial duplicado"
```

---

### Task 8: Atualizar o prompt do n8n (`GERADOR DE PROMPT2`) — execução manual, fora do repositório

**Este task não edita arquivos do repositório.** O prompt vive no workflow `PVtyGZ6gQrBABe83` do n8n (`https://arcil-n8n.47nukb.easypanel.host`), nó `GERADOR DE PROMPT2`, fora deste código-fonte. É produção real usada por vendedores agora — trate como deploy, não como código.

- [ ] **Step 1: Confirmar que ninguém está com o editor do n8n aberto numa aba**

Armadilha documentada em `AGENTS.md`: salvar do editor sobrescreve qualquer mudança feita via API depois que a aba foi aberta. Se alguém tiver o editor aberto, peça pra recarregar a aba antes de continuar.

- [ ] **Step 2: Ler o node atual (`GET /api/v1/workflows/PVtyGZ6gQrBABe83`, header `X-N8N-API-KEY`) e localizar o node `GERADOR DE PROMPT2`, pra não perder nenhuma outra configuração do node ao escrever de volta**

- [ ] **Step 3: Substituir o `text`/`systemMessage` do node pelo texto abaixo — testado em 7 gerações reais contra o Gemini 3 Pro Image, zero erro de texto nos callouts nas duas últimas rodadas**

```text
Edit only this exact photo, preserving the original room as closely as possible -- same furniture, same wood paneling, same sofa, same kitchen, same curtains, same plants, same camera angle, same lighting. Add a ceiling cassette AC unit, recessed into the flat ceiling above the seating group, centered between the existing spotlights, clear of the light cove. Add a spatial technical annotation layer on top, described below.

EQUIPMENT: a real Carrier-style 4-way cassette AC, square white panel flush with the ceiling. Matte white plastic, satin sheen, subtle visible panel seams and corner screws, four linear air-outlet louvers per edge, small dark sensor window at center, soft realistic contact shadow, photographed-looking, not illustrated.

ANNOTATION LAYER STYLE:
- Leader lines: thin off-white (~85% opacity), ORTHOGONAL only -- horizontal from the text, one bend, straight to a small solid white dot (3-4px) at the anchor point. No diagonals, no dashes, no arrowheads. Keep every leader line SHORT -- text sits close to what it points to, never in a far corner of the frame.
- Callout text: uppercase medium-bold title, one regular-weight description line below at ~80% opacity. NO background box or bar behind any text -- soft dark drop shadow only.
- Ghosted X-ray: translucent volume for the hidden body above the ceiling, copper refrigerant lines, translucent cable and drain (thin ghosted line + dot, never solid gray or an arrowhead), routed toward the right edge.
- Color: white/off-white only, except copper tone on the refrigerant lines.
- Keep the entire bottom 16% of the frame and the top 5% completely clear of any text or line -- reserved for a fixed footer card added afterward. Do not draw anything there.
- Do not draw a product/model card, a details list, a logo, a QR code, or any legal text -- none of that is your job.

--- STOP. Everything above this line is instruction, not text to render. Everything below, in quotes, is the ONLY text you draw. Copy it character-for-character, accents included. Do not invent, translate, reword, or add text beyond this list. ---

EXACT STRINGS TO RENDER:

1) Title "EVAPORADORA", description "[descrição da família — vem de `descricaoPorFamilia` em preview-annotations.ts / equivalente enviado no payload]" -- leader line to the unit, positioned close to it.

2) ONE combined callout, positioned immediately beside the unit (touching distance, not a far corner): title line "[FORRO ATÉ LAJE ou DISTÂNCIA DO TETO, conforme a família] · [valor da cota]", description "[Espaço técnico para unidade e infraestrutura. ou Afastamento até o teto: X.]" Include a short vertical ghosted dimension line with small tick marks right next to this callout, from the ceiling down to the top of the ghosted equipment body, matching the value.

3) Title "LIGAÇÃO ATÉ CONDENSADORA", description "Caminho da infraestrutura até a unidade externa: [unidade externa, se houver]." -- leader line toward the right edge, following the ghosted route.

4) Title "FLUXO DE AR", description "[texto de fluxo por tipo de equipamento]." -- short leader line to the unit's underside.

Render nothing else -- no other text, panel, or callout besides these four.
```

- [ ] **Step 4: Escrever de volta via `PUT /api/v1/workflows/PVtyGZ6gQrBABe83`, mandando o workflow inteiro de volta com só o node `GERADOR DE PROMPT2` alterado — nunca mandar um workflow parcial, a API do n8n substitui o documento inteiro**

- [ ] **Step 5: Testar com uma geração real (equipamento Cassete, com marcação) e conferir**

- QR, logo, MODELO, DETALHES não aparecem na área reservada (16% da base / 5% do topo) — se aparecerem, o Gemini não respeitou a instrução, revisar o prompt.
- EVAPORADORA, FORRO ATÉ LAJE+cota, LIGAÇÃO ATÉ CONDENSADORA, FLUXO DE AR aparecem certos, sem erro de acento/dígito.
- A composição vetorial (Task 6) por cima não duplica nenhum desses 4 — é a prova de que o early-return da Task 5 funcionou em produção, não só no teste sintético.

- [ ] **Step 6: Atualizar o JSON de referência do workflow, exportado em `docs/superpowers/specs/gerador-imagem-n8n-workflow.json` (mencionado no handoff da sessão anterior) — chave de API do Gemini redigida, igual já é feito hoje**

Sem isso o arquivo de referência do repo fica desatualizado em relação ao que está rodando em produção.

---

## Self-Review

**Cobertura da spec:**
- Linha ortogonal em vez de diagonal pontilhada → Task 5.
- Callouts (EVAPORADORA, FORRO+cota, LIGAÇÃO, FLUXO) desenhados pelo Gemini, sem duplicar vetorial → Task 5 (early-return) + Task 8 (prompt).
- MODELO/DETALHES sem caixa → Task 6.
- DETALHES DA INSTALAÇÃO como conteúdo novo (tipo_forro, alçapão, ponto elétrico, tubulação+metragem) → Task 3, 4, 6.
- Logo cinza translúcida + "Created by ARCIL AI" → Task 2, 6.
- QR num card branco, rótulo mais curto → Task 6.
- Selo removido → Task 6.
- SKU/MODELO continua vetorial (nunca pro Gemini) → já é assim (Task 6 só restiliza, não muda pra onde o dado vem).

**Placeholders:** nenhum "TBD"/"implementar depois" — os únicos colchetes (`[...]`) ficam dentro do texto do prompt do n8n na Task 8, porque esses valores já são resolvidos por template do próprio node `GERADOR DE PROMPT2` (mesmo padrão do prompt anterior, com `{{ }}` de n8n) — decisão de manter a sintaxe exata é do editor do node, fora do escopo de código deste plano.

**Consistência de tipos:** `tipoForro: string | null` (Task 3) usado igual em `route.ts` (Task 4) e `installation-overlay.ts` (Task 6, `detalhesInstalacaoNo`). `logoArcilClaro()` retorna `Promise<string | null>`, consumido com `await` em `logoNo` (agora `async`), que por sua vez é `await`ado em `camadaAncorada` (também `async` agora) e em `comporPrevia`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-previa-desenho-tecnico-gemini.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — eu despacho um subagente novo por task, reviso entre elas, iteração rápida.

**2. Execução inline** — executo as tasks nesta sessão via executing-plans, em lote com checkpoints.

**Qual prefere?**
