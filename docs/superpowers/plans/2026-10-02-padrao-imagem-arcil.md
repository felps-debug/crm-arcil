# Padrão de Imagem Arcil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda prévia do Gerador de Imagem sai como uma prancha Arcil padronizada: foto real preservada, infraestrutura em raio-x, cena da condensadora na mesma imagem, inspeção automática de qualidade e texto em português correto.

**Architecture:** O wizard passa a coletar só respostas fechadas (sem texto livre). A rota `/api/generate-image` dispara a cena principal e a da condensadora em paralelo, inspeciona a cena principal com visão (até 2 gerações), devolve os pixels originais fora da zona da instalação e compõe uma prancha (foto + faixa lateral fixa) com satori/sharp.

**Tech Stack:** Next.js 16 route handlers, sharp, satori, OpenAI chat completions (`gpt-5.1`, visão), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-padrao-imagem-arcil-design.md`

**Desvio consciente do spec:** a etapa "revisão de texto por GPT" (spec §2 [1]) sai. Com `ambiente` virando escolha sem campo "Outro" livre e `unidade_externa` virando escolha + medida, não sobra texto livre que chegue à imagem (o único `text` restante é a medida do vão da Janela, numérica). Um GPT sem entrada é custo sem efeito. A moldura da condensadora, quando a cena falha, mostra a lista de afastamentos (texto vetorial) em vez do esquema SVG — mais simples e igualmente correto.

**Regras do repo (AGENTS.md):** Next 16 tem APIs diferentes — consultar `node_modules/next/dist/docs/` se mexer em algo de framework. Lint local: `npx eslint src e2e scripts` (não `npm run lint`). Commits ficam **locais** na branch `feat/padrao-imagem-arcil`; nada de push.

---

## File structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/alertas-instalacao.ts` | criar | locais de condensadora, tensão do produto, alertas (cliente + servidor) |
| `src/lib/alertas-instalacao.test.ts` | criar | |
| `src/app/chatbot/_components/step-groups.ts` | reescrever `buildSteps`/grupos/HINTS | perguntas novas, acentos |
| `src/app/chatbot/_components/step-groups.test.ts` | atualizar | |
| `src/lib/server/acentos.test.ts` | criar | verificador de acentos nas strings que vão para a imagem |
| `src/lib/server/openai.ts` | criar | `openAI()` + `MODELO_TEXTO` (saem de `route.ts`) |
| `src/lib/server/preservar-foto.ts` (+ test) | criar | zona da instalação, alinhamento, mistura |
| `src/lib/server/inspetor-cena.ts` (+ test) | criar | inspeção por visão, leitura e decisão |
| `src/lib/server/diretriz-raio-x.ts` (+ test) | criar | texto padronizado do raio-x para o prompt |
| `src/lib/server/cena-condensadora.ts` | criar | chamada ao webhook da condensadora |
| `src/app/api/generate-image/condensadora-local/route.ts` | modificar | usa o módulo; 5 locais |
| `src/lib/server/previa-tipos.ts` | modificar | campos novos em `DadosOverlay` |
| `src/lib/server/preview-annotations.ts` | modificar | opção `prancha` em `planoAnotacoes` |
| `src/lib/server/installation-overlay.ts` | reescrever | prancha |
| `src/lib/server/installation-overlay.test.ts` | reescrever | |
| `src/app/api/generate-image/route.ts` | modificar | fluxo novo |
| `src/app/chatbot/page.tsx`, `_components/group-form.tsx`, `_components/resultado-painel.tsx` | modificar | alertas, campos, cena/condensadora reaproveitadas no ajuste |
| `src/app/api/chat/`, `src/lib/server/layouts/cassette-commercial-layout.ts`, `V2_CASSETTE_LAYOUT` | remover | código morto |

---

### Task 1: Alertas e locais da condensadora

**Files:**
- Create: `src/lib/alertas-instalacao.ts`
- Test: `src/lib/alertas-instalacao.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { alertasInstalacao, chaveDoLocal, tensaoDoProduto, LOCAIS_CONDENSADORA } from "./alertas-instalacao";

describe("chaveDoLocal", () => {
  it("converte o rótulo da tela na chave do webhook", () => {
    expect(chaveDoLocal("Telhado")).toBe("telhado");
    expect(chaveDoLocal("Chão (base)")).toBe("chao");
    expect(chaveDoLocal("Parede externa (suporte)")).toBe("parede_externa");
    expect(chaveDoLocal("qualquer coisa")).toBeNull();
    expect(chaveDoLocal(undefined)).toBeNull();
  });
  it("tem os 5 locais", () => {
    expect(LOCAIS_CONDENSADORA).toHaveLength(5);
  });
});

describe("tensaoDoProduto", () => {
  it("lê 220V/127V do nome do ERP", () => {
    expect(tensaoDoProduto("SPLIT HI-WALL 12000 BTUS INVERTER 220V")).toBe(220);
    expect(tensaoDoProduto("Split 9000 127 V frio")).toBe(127);
    expect(tensaoDoProduto("Split 9000 bivolt")).toBeNull();
    expect(tensaoDoProduto(null)).toBeNull();
  });
});

describe("alertasInstalacao", () => {
  const base = { tipo_equipamento: "Split Hi-Wall", modelo: "SPLIT 12000 220V" };
  it("sem nada fora do padrão, nenhum alerta", () => {
    expect(alertasInstalacao({ ...base, tensao: "220 V", obstaculos: "Não", dreno: "Para fora pela parede", ponto_eletrico: "Sim" })).toEqual([]);
  });
  it("tensão diferente da do aparelho", () => {
    expect(alertasInstalacao({ ...base, tensao: "127 V" })[0]).toMatch(/Tensão do ponto \(127 V\) diferente da do aparelho \(220 V\)/);
  });
  it("tensão desconhecida, obstáculo, bomba e ponto a executar", () => {
    const a = alertasInstalacao({ ...base, tensao: "Não sei", obstaculos: "Sim", dreno: "Precisa de bomba de dreno", ponto_eletrico: "Não" });
    expect(a).toHaveLength(4);
    expect(a.join(" ")).toMatch(/afastamento mínimo/);
    expect(a.join(" ")).toMatch(/bomba de dreno/);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/alertas-instalacao.test.ts` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implement**

```ts
import { getHvacStandard } from "@/constants/hvac-standards";

/**
 * Locais da condensadora e alertas de instalação, a partir das respostas
 * fechadas do wizard. Compartilhado entre a tela (alerta na hora, no grupo)
 * e a rota (card de garantia da prancha) — a mesma regra escrita duas vezes
 * diverge.
 */

export type LocalCondensadora = "telhado" | "laje_tecnica" | "sacada_tecnica" | "parede_externa" | "chao";

export const LOCAIS_CONDENSADORA: { rotulo: string; chave: LocalCondensadora }[] = [
  { rotulo: "Telhado", chave: "telhado" },
  { rotulo: "Laje técnica", chave: "laje_tecnica" },
  { rotulo: "Sacada técnica", chave: "sacada_tecnica" },
  { rotulo: "Parede externa (suporte)", chave: "parede_externa" },
  { rotulo: "Chão (base)", chave: "chao" },
];

export function chaveDoLocal(rotulo: string | null | undefined): LocalCondensadora | null {
  return LOCAIS_CONDENSADORA.find((l) => l.rotulo === rotulo)?.chave ?? null;
}

/** O ERP não tem coluna de tensão; ela vem no nome ("... 220V"). Bivolt ou
 *  sem menção devolve `null` — sem dado, sem alerta. */
export function tensaoDoProduto(nome: string | null | undefined): 127 | 220 | null {
  const m = /\b(127|220)\s*v\b/i.exec(nome ?? "");
  return m ? (Number(m[1]) as 127 | 220) : null;
}

export function alertasInstalacao(answers: Record<string, string | undefined>): string[] {
  const regra = getHvacStandard(answers.tipo_equipamento ?? "");
  const alertas: string[] = [];

  const tensaoPonto = answers.tensao === "127 V" ? 127 : answers.tensao === "220 V" ? 220 : null;
  const tensaoAparelho = tensaoDoProduto(answers.modelo);
  if (tensaoPonto && tensaoAparelho && tensaoPonto !== tensaoAparelho) {
    alertas.push(`Tensão do ponto (${tensaoPonto} V) diferente da do aparelho (${tensaoAparelho} V): adequar antes de instalar.`);
  }
  if (answers.tensao === "Não sei") alertas.push("Confirmar a tensão do ponto elétrico antes de instalar.");
  if (answers.obstaculos === "Sim") {
    alertas.push(`Manter afastamento mínimo do aparelho: teto ${regra.cota_teto}, laterais ${regra.cota_lateral}.`);
  }
  if (answers.dreno === "Precisa de bomba de dreno") alertas.push("Instalar bomba de dreno compatível com o aparelho.");
  if (answers.ponto_eletrico === "Não") alertas.push("Executar ponto elétrico exclusivo, com disjuntor dedicado e aterramento.");
  return alertas;
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS. If `getHvacStandard` import pulls something server-only, it won't: `hvac-standards.ts` has no imports.

- [ ] **Step 5: Commit** `git add src/lib/alertas-instalacao.ts src/lib/alertas-instalacao.test.ts && git commit -m "feat(gerador): alertas de instalação e locais da condensadora"`

---

### Task 2: Questionário novo

**Files:**
- Modify: `src/app/chatbot/_components/step-groups.ts` (substituir `NIVEL_CONDENSADORA`…`GRUPOS_TECNICOS_PADRAO`, mantendo `buildStepGroups` e `grupoRespondido`)
- Test: `src/app/chatbot/_components/step-groups.test.ts`

- [ ] **Step 1: Atualizar os testes.** Manter os dois primeiros `it` (cobertura e títulos) e o de Foto/Marcação; substituir os testes de grupos específicos por:

```ts
  it("Ambiente vira escolha, sem texto livre", () => {
    const ambiente = buildSteps(null).find((s) => s.key === "ambiente")!;
    expect(ambiente.type).toBe("choice");
  });

  it("nenhum tipo pergunta unidade_externa nem metragem_infra", () => {
    for (const tipo of TIPOS) {
      const chaves = buildSteps(tipo).map((s) => s.key);
      expect(chaves).not.toContain("unidade_externa");
      expect(chaves).not.toContain("metragem_infra");
    }
  });

  it("todo tipo com condensadora separada pergunta local, distância, dreno e tensão", () => {
    for (const tipo of [null, "Split Hi-Wall", "Cassete", "Dutado", "Piso-teto"]) {
      const chaves = buildSteps(tipo).map((s) => s.key);
      for (const k of ["local_condensadora", "distancia_condensadora", "dreno", "tensao"]) expect(chaves).toContain(k);
    }
  });

  it("Janela não pergunta condensadora nem dreno, mas pergunta tensão", () => {
    const chaves = buildSteps("Janela").map((s) => s.key);
    expect(chaves).not.toContain("local_condensadora");
    expect(chaves).not.toContain("dreno");
    expect(chaves).toContain("tensao");
  });

  it("só o Hi-Wall pergunta obstáculos", () => {
    expect(buildSteps("Split Hi-Wall").map((s) => s.key)).toContain("obstaculos");
    expect(buildSteps("Cassete").map((s) => s.key)).not.toContain("obstaculos");
  });

  it("Cassete: Forro, Elétrica e dreno, Condensadora e tubulação", () => {
    const grupos = buildStepGroups("Cassete").slice(3);
    expect(grupos.map((g) => g.titulo)).toEqual(["Forro", "Elétrica e dreno", "Condensadora e tubulação"]);
  });
```

Remover os testes antigos que citam `Infraestrutura`/`unidade_externa`/`metragem_infra`. Manter os testes de `grupoRespondido` (ajustando qualquer chave removida para uma existente, ex.: `tipo_parede`).

- [ ] **Step 2: Run** `npx vitest run src/app/chatbot/_components/step-groups.test.ts` — Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement.** Adicionar import no topo: `import { LOCAIS_CONDENSADORA } from "@/lib/alertas-instalacao";` e substituir o bloco de constantes + `buildSteps` + `HINTS` + `GRUPOS_TECNICOS*` por:

```ts
const LOCAL_CONDENSADORA: Step = {
  key: "local_condensadora",
  question: "Onde a condensadora vai ficar?",
  type: "choice",
  options: LOCAIS_CONDENSADORA.map((l) => l.rotulo),
};
const DISTANCIA_CONDENSADORA: Step = {
  key: "distancia_condensadora",
  question: "Qual a distância entre a evaporadora e a condensadora?",
  type: "medida",
  unidades: ["m"],
};
const NIVEL_CONDENSADORA: Step = {
  key: "nivel_condensadora",
  question: "A condensadora fica acima, abaixo ou no mesmo nível do ambiente?",
  type: "choice",
  options: ["Acima do ambiente", "Abaixo do ambiente", "Mesmo nível do ambiente"],
};
const DRENO: Step = {
  key: "dreno",
  question: "Para onde vai a água do dreno?",
  type: "choice",
  options: ["Para fora pela parede", "Ligado em ralo ou esgoto", "Precisa de bomba de dreno"],
};
const TENSAO: Step = { key: "tensao", question: "Qual a tensão do ponto elétrico?", type: "choice", options: ["127 V", "220 V", "Não sei"] };
const TUBULACAO_PAREDE: Step = {
  key: "tubulacao",
  question: "Como a tubulação vai correr?",
  type: "choice",
  options: ["Embutida na parede", "Canaleta aparente", "Sem canaleta"],
};

/**
 * Ordem de cada ramo = ordem dos grupos em `buildStepGroups` (o teste compara
 * as duas listas na mesma ordem). Nenhuma pergunta é texto livre: tudo que vai
 * para a prévia sai de opção fixa ou de medida — texto livre já levou
 * "Distância aproximada: Sacada" e "NAO SEI DIZER" para a imagem do cliente.
 */
export function buildSteps(tipo: string | null): Step[] {
  const inicio: Step[] = [
    {
      key: "ambiente",
      question: "Qual o ambiente da instalação?",
      type: "choice",
      options: ["Sala", "Quarto", "Escritório", "Cozinha", "Comércio", "Outro"],
    },
    { key: "produto", question: "Qual o aparelho? Busque pelo código do ERP, modelo ou marca.", type: "produto" },
    { key: "foto", question: "Envie uma foto do ambiente", type: "file" },
    {
      key: "marcacao",
      question: "Marque na foto onde o aparelho vai e, se souber, pra onde a infraestrutura sai.",
      type: "marcacao",
    },
  ];
  const eletricaEDreno = (local: string): Step[] => [
    { key: "ponto_eletrico", question: `Já existe ponto elétrico ${local}?`, type: "choice", options: ["Sim", "Não"] },
    TENSAO,
    DRENO,
  ];

  if (tipo === "Cassete") {
    return [
      ...inicio,
      { key: "tipo_forro", question: "Qual o tipo do forro?", type: "choice", options: ["Gesso", "PVC", "Modular", "Outro"] },
      { key: "pe_direito", question: "Qual a altura entre a laje e o forro (plenum), no ponto de instalação?", type: "medida", unidades: ["cm", "m"] },
      { key: "alcapao", question: "A instalação deve incluir alçapão de inspeção?", type: "choice", options: ["Sim", "Não"] },
      ...eletricaEDreno("no forro, no local de instalação"),
      LOCAL_CONDENSADORA,
      DISTANCIA_CONDENSADORA,
      NIVEL_CONDENSADORA,
      { key: "tubulacao", question: "Tubulação e dreno correm embutidos ou aparentes sob o forro?", type: "choice", options: ["Embutidos no forro", "Aparentes sob o forro"] },
    ];
  }

  if (tipo === "Dutado") {
    return [
      ...inicio,
      { key: "tipo_forro", question: "Qual o tipo do forro onde a rede de dutos vai correr?", type: "choice", options: ["Gesso", "PVC", "Modular", "Outro"] },
      { key: "pe_direito", question: "Qual o espaço técnico disponível entre a laje e o forro (plenum)?", type: "medida", unidades: ["cm", "m"] },
      { key: "rede_dutos", question: "Já existe rede de dutos instalada ou será nova?", type: "choice", options: ["Nova instalação", "Rede existente"] },
      ...eletricaEDreno("no espaço técnico"),
      LOCAL_CONDENSADORA,
      DISTANCIA_CONDENSADORA,
      NIVEL_CONDENSADORA,
    ];
  }

  if (tipo === "Piso-teto") {
    return [
      ...inicio,
      { key: "superficie_fixacao", question: "A unidade interna será fixada no piso ou no teto?", type: "choice", options: ["Piso", "Teto"] },
      { key: "pe_direito", question: "Qual a altura do pé-direito?", type: "medida", unidades: ["m", "cm"] },
      ...eletricaEDreno("no local de instalação"),
      LOCAL_CONDENSADORA,
      DISTANCIA_CONDENSADORA,
      NIVEL_CONDENSADORA,
      TUBULACAO_PAREDE,
    ];
  }

  if (tipo === "Janela") {
    return [
      ...inicio,
      { key: "vao_janela", question: "O vão da janela/parede já existe ou será aberto para a instalação?", type: "choice", options: ["Vão já existe", "Será aberto/adaptado"] },
      { key: "pe_direito", question: "Quais as medidas aproximadas do vão (largura x altura)?", type: "text" },
      { key: "ponto_eletrico", question: "Já existe ponto elétrico exclusivo próximo ao vão?", type: "choice", options: ["Sim", "Não"] },
      TENSAO,
    ];
  }

  // "Split Hi-Wall" e o estado inicial (tipo ainda não escolhido).
  return [
    ...inicio,
    { key: "tipo_parede", question: "Qual o tipo da parede?", type: "choice", options: ["Alvenaria", "Drywall", "Outro"] },
    { key: "pe_direito", question: "Qual a altura do pé-direito?", type: "medida", unidades: ["m", "cm"] },
    {
      key: "obstaculos",
      question: "Há sanca, viga, cortina ou armário a menos de 30 cm do aparelho?",
      type: "choice",
      options: ["Sim", "Não"],
    },
    ...eletricaEDreno("na parede"),
    LOCAL_CONDENSADORA,
    DISTANCIA_CONDENSADORA,
    NIVEL_CONDENSADORA,
    TUBULACAO_PAREDE,
  ];
}

export const HINTS: Partial<Record<string, string>> = {
  tipo_forro: "Material do forro no ponto onde o aparelho vai ser embutido.",
  pe_direito: "Altura do chão até o teto, medida na parede onde a unidade vai.",
  alcapao: "Abertura de acesso para manutenção, embutida no forro.",
  rede_dutos: "Os dutos que distribuem o ar já existem ou serão instalados agora?",
  superficie_fixacao: "Onde a unidade interna fica presa: no chão ou pendurada no teto.",
  tipo_parede: "Material da parede onde a unidade vai ser fixada.",
  obstaculos: "O fabricante exige espaço livre em volta do aparelho para o ar circular.",
  ponto_eletrico: "Tomada ou fiação exclusiva já disponível no local de instalação.",
  tensao: "Confira no disjuntor ou com um multímetro. Tensão errada queima a placa e anula a garantia.",
  dreno: "A água que o aparelho retira do ar precisa de caminho com caimento contínuo.",
  vao_janela: "Medida do espaço livre onde o aparelho encaixa — largura x altura.",
  local_condensadora: "Onde a unidade externa vai ser instalada.",
  distancia_condensadora: "Comprimento aproximado da tubulação entre as duas unidades.",
  nivel_condensadora: "Compara a altura de onde a condensadora fica com a do ambiente climatizado.",
  tubulacao: "Se a tubulação de cobre e o dreno correm escondidos ou à mostra.",
};

type GrupoTecnico = { titulo: string; chaves: string[] };

const ELETRICA = { titulo: "Elétrica e dreno", chaves: ["ponto_eletrico", "tensao", "dreno"] };

const GRUPOS_TECNICOS: Record<string, GrupoTecnico[]> = {
  Cassete: [
    { titulo: "Forro", chaves: ["tipo_forro", "pe_direito", "alcapao"] },
    ELETRICA,
    { titulo: "Condensadora e tubulação", chaves: ["local_condensadora", "distancia_condensadora", "nivel_condensadora", "tubulacao"] },
  ],
  Dutado: [
    { titulo: "Forro e dutos", chaves: ["tipo_forro", "pe_direito", "rede_dutos"] },
    ELETRICA,
    { titulo: "Condensadora", chaves: ["local_condensadora", "distancia_condensadora", "nivel_condensadora"] },
  ],
  "Piso-teto": [
    { titulo: "Estrutura", chaves: ["superficie_fixacao", "pe_direito"] },
    ELETRICA,
    { titulo: "Condensadora e tubulação", chaves: ["local_condensadora", "distancia_condensadora", "nivel_condensadora", "tubulacao"] },
  ],
  Janela: [{ titulo: "Vão e elétrica", chaves: ["vao_janela", "pe_direito", "ponto_eletrico", "tensao"] }],
};
const GRUPOS_TECNICOS_PADRAO: GrupoTecnico[] = [
  { titulo: "Estrutura", chaves: ["tipo_parede", "pe_direito", "obstaculos"] },
  ELETRICA,
  { titulo: "Condensadora e tubulação", chaves: ["local_condensadora", "distancia_condensadora", "nivel_condensadora", "tubulacao"] },
];
```

- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(gerador): questionário com dreno, tensão, obstáculos e local da condensadora"` (after `git add` of the two files).

---

### Task 3: Verificador de acentos

**Files:**
- Create: `src/lib/server/acentos.test.ts`

- [ ] **Step 1: Write the test**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda string destes arquivos pode acabar impressa na prévia do cliente. Já
 * saiu "Mesmo nivel do ambiente" assim. Chaves internas (só minúsculas e _)
 * ficam de fora: são identificadores, não texto.
 */
const ARQUIVOS = [
  "src/app/chatbot/_components/step-groups.ts",
  "src/lib/alertas-instalacao.ts",
  "src/lib/server/installation-overlay.ts",
  "src/lib/server/preview-annotations.ts",
  "src/constants/hvac-standards.ts",
  "src/constants/arcil-brand.ts",
  "src/app/api/generate-image/condensadora-local/route.ts",
];

const SEM_ACENTO = [
  "instalacao", "tubulacao", "nivel", "sera", "pe-direito", "pe direito", "eletrico", "eletrica", "distancia",
  "alcapao", "manutencao", "vacuo", "agua", "vao", "minimo", "minima", "maximo", "tensao", "area", "tecnica",
  "tecnico", "inclinacao", "ligacao", "conexao", "obrigatorio", "obrigatoria", "protecao", "ventilacao",
  "posicao", "previa", "nao", "sao", "ja", "apos", "chao", "ate", "numero", "opcao", "especificacoes",
  "isolacao", "condensacao", "fixacao", "aterramento eletrico", "bomba de dreno compativel", "termico", "termica",
];

function literais(fonte: string): string[] {
  const achados: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of fonte.matchAll(re)) {
    const texto = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    if (/^[a-z0-9_./@-]*$/.test(texto)) continue;
    achados.push(texto);
  }
  return achados;
}

describe("texto que vai para a imagem", () => {
  it.each(ARQUIVOS)("%s não tem palavra sem acento", (arquivo) => {
    const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");
    const erros: string[] = [];
    for (const texto of literais(fonte)) {
      for (const palavra of SEM_ACENTO) {
        if (new RegExp(`(^|[^\\p{L}])${palavra}([^\\p{L}]|$)`, "iu").test(texto)) erros.push(`"${palavra}" em: ${texto}`);
      }
    }
    expect(erros).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/acentos.test.ts`. Expected: FAIL listing strings. For **each** reported string, fix the accent in the source file (example: `"Mesmo nivel do ambiente"` → `"Mesmo nível do ambiente"`). If a hit is not user text (e.g. a URL, a regex source like `/vácuo|vacuo/` used for matching, or an SVG attribute), exclude it by adjusting `literais` only for that pattern class (regex literals are not matched by `literais` since they are not quoted; JSON-ish keys like `"pe_direito"` are skipped by the lowercase rule). Do not exclude real prose. Update `installation-overlay.test.ts` fixture `"Mesmo nivel do ambiente"` too if it appears in an asserted string.
- [ ] **Step 3: Run** again until PASS; also `npx vitest run` for anything that compared the old strings.
- [ ] **Step 4: Commit** `git add -A src && git commit -m "test(previa): reprova texto sem acento que vai para a imagem"`

> Note: Task 7 rewrites `installation-overlay.ts`; this test keeps guarding it.

---

### Task 4: `openai.ts` compartilhado

**Files:**
- Create: `src/lib/server/openai.ts`
- Modify: `src/app/api/generate-image/route.ts:106-140` (remove `MODELO_TEXTO` and `openAI`, import them)

- [ ] **Step 1:** Create `src/lib/server/openai.ts` with the exact body of `MODELO_TEXTO` and `openAI` from `route.ts` lines 106-140 (doc comments included), adding `import { OPENAI_API_KEY } from "@/lib/env";` and `export` on both.
- [ ] **Step 2:** In `route.ts`, delete those lines and add `import { openAI, MODELO_TEXTO } from "@/lib/server/openai";`. Remove `OPENAI_API_KEY` from the `@/lib/env` import only if no longer used (it is still used by `assertEnv` — keep it).
- [ ] **Step 3: Run** `npm run typecheck` — Expected: no errors.
- [ ] **Step 4: Commit** `git commit -am "refactor(gerador): chamada OpenAI em módulo próprio"` (add the new file first).

---

### Task 5: Preservação da foto

**Files:**
- Create: `src/lib/server/preservar-foto.ts`
- Test: `src/lib/server/preservar-foto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { preservarFoto, zonaDaInstalacao } from "./preservar-foto";
import type { Marcacao } from "@/lib/marcacao";

const W = 400;
const H = 300;
const MARCACAO: Marcacao = { caixa: { x: 0.4, y: 0.2, w: 0.2, h: 0.1 }, rota: [{ x: 0.6, y: 0.25 }, { x: 0.8, y: 0.3 }] };

const liso = (r: number, g: number, b: number) =>
  sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer();

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("zonaDaInstalacao", () => {
  it("envolve caixa e rota, com margem, sem sair de 0..1", () => {
    const z = zonaDaInstalacao(MARCACAO, 0.1);
    expect(z.x0).toBeCloseTo(0.3);
    expect(z.x1).toBeCloseTo(0.9);
    expect(z.y0).toBeCloseTo(0.1);
    expect(z.y1).toBeCloseTo(0.4);
    const borda = zonaDaInstalacao({ caixa: { x: 0, y: 0, w: 0.1, h: 0.1 }, rota: [] }, 0.1);
    expect(borda.x0).toBe(0);
    expect(borda.y0).toBe(0);
  });
});

describe("preservarFoto", () => {
  it("fora da zona volta o pixel original; dentro fica a cena", async () => {
    const original = await liso(200, 200, 200);
    // Cena: mesma parede (levemente diferente, como o modelo devolve) com um "aparelho" vermelho na zona.
    const cena = await sharp(await liso(196, 198, 202))
      .composite([{ input: await sharp({ create: { width: 60, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(), left: 170, top: 70 }])
      .png()
      .toBuffer();
    const { imagem, aplicada } = await preservarFoto(original, cena, MARCACAO);
    expect(aplicada).toBe(true);
    expect(await pixel(imagem, 10, 290)).toEqual([200, 200, 200]);
    const [r, g] = await pixel(imagem, 200, 80);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(20);
  });

  it("cena desalinhada (muito diferente fora da zona) não é misturada", async () => {
    const { aplicada } = await preservarFoto(await liso(200, 200, 200), await liso(20, 60, 20), MARCACAO);
    expect(aplicada).toBe(false);
  });

  it("sem marcação devolve a cena", async () => {
    const cena = await liso(10, 10, 10);
    const { aplicada } = await preservarFoto(await liso(200, 200, 200), cena, null);
    expect(aplicada).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/preservar-foto.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
import sharp from "sharp";
import type { Marcacao } from "@/lib/marcacao";

/**
 * Devolve à cena gerada os pixels da foto original em tudo que fica fora da
 * zona da instalação.
 *
 * O modelo de imagem redesenha a foto inteira, e pedir no prompt "não mude o
 * resto" não garante nada: móvel, janela e cor da parede saem parecidos, não
 * iguais. Aqui o ambiente fica idêntico por construção — fora da zona, o pixel
 * É o da foto do cliente.
 *
 * Se o modelo deslocou ou reenquadrou a cena, misturar criaria um "fantasma"
 * (duas paredes desencontradas). Por isso a mistura só acontece quando, fora
 * da zona, as duas imagens já são parecidas.
 */

export type ZonaFrac = { x0: number; y0: number; x1: number; y1: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Caixa do aparelho ∪ rota da infraestrutura, expandida por `margem` (fração de cada eixo). */
export function zonaDaInstalacao(m: Marcacao, margem = 0.1): ZonaFrac {
  const xs = [m.caixa.x, m.caixa.x + m.caixa.w, ...m.rota.map((p) => p.x)];
  const ys = [m.caixa.y, m.caixa.y + m.caixa.h, ...m.rota.map((p) => p.y)];
  return {
    x0: clamp01(Math.min(...xs) - margem),
    y0: clamp01(Math.min(...ys) - margem),
    x1: clamp01(Math.max(...xs) + margem),
    y1: clamp01(Math.max(...ys) + margem),
  };
}

/** Diferença média por canal (0-255) fora da zona, medida em 64×64. Calibrado
 *  na validação local: cena alinhada fica bem abaixo; reenquadrada, bem acima. */
export const LIMIAR_DESALINHO = 32;

async function diferencaForaDaZona(a: Buffer, b: Buffer, z: ZonaFrac): Promise<number> {
  const L = 64;
  const ler = (buf: Buffer) => sharp(buf).resize(L, L, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [pa, pb] = await Promise.all([ler(a), ler(b)]);
  let soma = 0;
  let n = 0;
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const fx = (x + 0.5) / L;
      const fy = (y + 0.5) / L;
      if (fx >= z.x0 && fx <= z.x1 && fy >= z.y0 && fy <= z.y1) continue;
      const i = (y * L + x) * 3;
      soma += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
      n += 3;
    }
  }
  return n ? soma / n : 0;
}

export async function preservarFoto(
  original: Buffer,
  cena: Buffer,
  marcacao: Marcacao | null
): Promise<{ imagem: Buffer; aplicada: boolean }> {
  if (!marcacao) return { imagem: cena, aplicada: false };
  try {
    const meta = await sharp(cena).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return { imagem: cena, aplicada: false };

    const zona = zonaDaInstalacao(marcacao);
    // `.rotate()` aplica a orientação EXIF da foto do celular antes de comparar.
    const originalAjustada = await sharp(original).rotate().resize(W, H, { fit: "fill" }).removeAlpha().png().toBuffer();

    const diferenca = await diferencaForaDaZona(originalAjustada, cena, zona);
    if (diferenca > LIMIAR_DESALINHO) {
      console.error(`[preservarFoto] cena desalinhada (diferença ${diferenca.toFixed(1)}), sem mistura`);
      return { imagem: cena, aplicada: false };
    }

    const sigma = Math.max(1, Math.min(W, H) * 0.02);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><rect x="${zona.x0 * W}" y="${zona.y0 * H}" width="${(zona.x1 - zona.x0) * W}" height="${(zona.y1 - zona.y0) * H}" fill="#fff"/></svg>`;
    const mascara = await sharp(Buffer.from(svg)).blur(sigma).extractChannel(0).raw().toBuffer();
    const cenaComAlfa = await sharp(cena)
      .removeAlpha()
      .joinChannel(mascara, { raw: { width: W, height: H, channels: 1 } })
      .png()
      .toBuffer();
    const imagem = await sharp(originalAjustada).composite([{ input: cenaComAlfa }]).png().toBuffer();
    return { imagem, aplicada: true };
  } catch (err) {
    console.error("[preservarFoto] falhou, usando a cena:", err instanceof Error ? err.message : err);
    return { imagem: cena, aplicada: false };
  }
}
```

- [ ] **Step 4: Run** test — PASS. If the "fora da zona" pixel is off by the blur halo, the probe at (10, 290) is far from the zona (zona y1 = 0.4 → 120 px), so it must be exact.
- [ ] **Step 5: Commit** `git add src/lib/server/preservar-foto* && git commit -m "feat(previa): devolve a foto original fora da zona da instalação"`

---

### Task 6: Inspetor de cena

**Files:**
- Create: `src/lib/server/inspetor-cena.ts`
- Test: `src/lib/server/inspetor-cena.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { deveRegenerar, lerInspecao, motivoDaInspecao } from "./inspetor-cena";

const OK = { ambiente_preservado: true, infra_por_dentro: true, aparelho_confere: true, sem_texto: true, posicao_confere: true, motivo: "" };

describe("lerInspecao", () => {
  it("aceita JSON puro e cercado por ```json", () => {
    expect(lerInspecao(JSON.stringify(OK))).toEqual(OK);
    expect(lerInspecao("```json\n" + JSON.stringify(OK) + "\n```")).toEqual(OK);
  });
  it("recusa campo faltando ou de tipo errado", () => {
    expect(lerInspecao(JSON.stringify({ ...OK, sem_texto: "sim" }))).toBeNull();
    expect(lerInspecao("não é json")).toBeNull();
  });
});

describe("deveRegenerar", () => {
  it("regenera por ambiente, infra, aparelho ou texto", () => {
    expect(deveRegenerar(OK, "Split Hi-Wall")).toBe(false);
    expect(deveRegenerar({ ...OK, sem_texto: false }, "Split Hi-Wall")).toBe(true);
    expect(deveRegenerar({ ...OK, infra_por_dentro: false }, "Split Hi-Wall")).toBe(true);
  });
  it("posição errada só avisa; infra é ignorada na Janela", () => {
    expect(deveRegenerar({ ...OK, posicao_confere: false }, "Split Hi-Wall")).toBe(false);
    expect(deveRegenerar({ ...OK, infra_por_dentro: false }, "Janela")).toBe(false);
  });
});

describe("motivoDaInspecao", () => {
  it("null quando tudo confere; texto pt-BR quando não", () => {
    expect(motivoDaInspecao(OK, "Split Hi-Wall")).toBeNull();
    expect(motivoDaInspecao({ ...OK, ambiente_preservado: false, motivo: "sofá sumiu" }, "Split Hi-Wall")).toMatch(/ambiente.*sofá sumiu/i);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/inspetor-cena.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
import sharp from "sharp";
import { openAI, MODELO_TEXTO } from "./openai";

/**
 * Confere a cena gerada antes de o vendedor ver. Os critérios são os que já
 * deram prévia ruim em produção: ambiente redesenhado, tubulação "colada" por
 * fora em vez de mostrada por dentro, aparelho genérico e letra escrita pelo
 * modelo ("EVAPORADora").
 */

export type ResultadoInspecao = {
  ambiente_preservado: boolean;
  infra_por_dentro: boolean;
  aparelho_confere: boolean;
  sem_texto: boolean;
  posicao_confere: boolean;
  motivo: string;
};

const CAMPOS_BOOL = ["ambiente_preservado", "infra_por_dentro", "aparelho_confere", "sem_texto", "posicao_confere"] as const;

export function lerInspecao(bruto: string): ResultadoInspecao | null {
  try {
    const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const o = JSON.parse(limpo) as Record<string, unknown>;
    if (!CAMPOS_BOOL.every((c) => typeof o[c] === "boolean")) return null;
    return {
      ambiente_preservado: o.ambiente_preservado as boolean,
      infra_por_dentro: o.infra_por_dentro as boolean,
      aparelho_confere: o.aparelho_confere as boolean,
      sem_texto: o.sem_texto as boolean,
      posicao_confere: o.posicao_confere as boolean,
      motivo: typeof o.motivo === "string" ? o.motivo : "",
    };
  } catch {
    return null;
  }
}

const ehJanela = (tipo: string) => tipo.trim().toLowerCase() === "janela";

export function deveRegenerar(r: ResultadoInspecao, tipo: string): boolean {
  return !r.ambiente_preservado || !r.aparelho_confere || !r.sem_texto || (!ehJanela(tipo) && !r.infra_por_dentro);
}

export function motivoDaInspecao(r: ResultadoInspecao, tipo: string): string | null {
  const falhas: string[] = [];
  if (!r.ambiente_preservado) falhas.push("o ambiente foi alterado");
  if (!ehJanela(tipo) && !r.infra_por_dentro) falhas.push("a infraestrutura não aparece por dentro");
  if (!r.aparelho_confere) falhas.push("o aparelho não confere com o produto");
  if (!r.sem_texto) falhas.push("a IA escreveu texto na cena");
  if (!r.posicao_confere) falhas.push("o aparelho saiu fora da posição marcada");
  if (falhas.length === 0) return null;
  const detalhe = r.motivo.trim() ? ` (${r.motivo.trim()})` : "";
  return `Inspeção automática: ${falhas.join(", ")}${detalhe}. Revise antes de enviar ao cliente.`;
}

async function paraDataUrl(buf: Buffer): Promise<string> {
  const jpeg = await sharp(buf).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function inspecionarCena(args: {
  foto: Buffer;
  cena: Buffer;
  produto: Buffer | null;
  tipo: string;
  tubulacao: string | null;
}): Promise<ResultadoInspecao | null> {
  try {
    const imagens = [
      { type: "text", text: "IMAGEM 1 — foto original do ambiente do cliente:" },
      { type: "image_url", image_url: { url: await paraDataUrl(args.foto), detail: "high" } },
      { type: "text", text: "IMAGEM 2 — cena gerada com o ar-condicionado instalado:" },
      { type: "image_url", image_url: { url: await paraDataUrl(args.cena), detail: "high" } },
      ...(args.produto
        ? [
            { type: "text", text: "IMAGEM 3 — foto de catálogo do aparelho escolhido:" },
            { type: "image_url", image_url: { url: await paraDataUrl(args.produto), detail: "low" } },
          ]
        : []),
    ];
    const raw = await openAI({
      model: MODELO_TEXTO,
      messages: [
        {
          role: "user",
          content: [
            ...imagens,
            {
              type: "text",
              text:
                `Você é o controle de qualidade de prévias de instalação de ar-condicionado (${args.tipo}` +
                `${args.tubulacao ? `, tubulação: ${args.tubulacao}` : ""}). Compare as imagens e responda APENAS um JSON válido, sem markdown:\n` +
                '{"ambiente_preservado": bool, "infra_por_dentro": bool, "aparelho_confere": bool, "sem_texto": bool, "posicao_confere": bool, "motivo": "frase curta em português"}\n' +
                "- ambiente_preservado: móveis, janelas, portas, cores e enquadramento da IMAGEM 2 são os da IMAGEM 1 (só o aparelho e a infraestrutura foram acrescentados).\n" +
                "- infra_por_dentro: tubulação/dreno/cabo aparecem por dentro da canaleta, da parede ou do forro em efeito raio-x translúcido (ou aparentes com abraçadeiras, se a tubulação for 'Sem canaleta').\n" +
                "- aparelho_confere: o aparelho da IMAGEM 2 tem o formato e o acabamento do da IMAGEM 3 (true se não houver IMAGEM 3).\n" +
                "- sem_texto: a IMAGEM 2 não tem nenhuma letra, número, legenda ou marca d'água desenhados pela IA.\n" +
                "- posicao_confere: o aparelho está num lugar plausível da parede/forro, sem flutuar nem atravessar objetos.",
            },
          ],
        },
      ],
      max_tokens: 300,
    });
    return lerInspecao(raw);
  } catch (err) {
    console.error("[inspetor-cena] falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 4: Run** test — PASS. `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/server/inspetor-cena* && git commit -m "feat(previa): inspetor de qualidade da cena por visão"`

---

### Task 7: Diretriz de raio-x

**Files:**
- Create: `src/lib/server/diretriz-raio-x.ts`
- Test: `src/lib/server/diretriz-raio-x.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { diretrizRaioX } from "./diretriz-raio-x";

describe("diretrizRaioX", () => {
  it("cada caso de tubulação tem sua frase, sempre com a regra comum", () => {
    expect(diretrizRaioX("Split Hi-Wall", "Embutida na parede")).toMatch(/inside the wall/);
    expect(diretrizRaioX("Split Hi-Wall", "Canaleta aparente")).toMatch(/semi-transparent white PVC/);
    expect(diretrizRaioX("Cassete", "Embutidos no forro")).toMatch(/ceiling/);
    expect(diretrizRaioX("Split Hi-Wall", "Sem canaleta")).toMatch(/clamps/);
    expect(diretrizRaioX("Split Hi-Wall", null)).toMatch(/NO letters/);
  });
  it("Janela não tem infraestrutura", () => {
    expect(diretrizRaioX("Janela", null)).toBe("");
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (em inglês de propósito: é instrução ao modelo de imagem, nunca impressa)

```ts
/**
 * Linguagem visual única da infraestrutura na cena. Vai para o n8n dentro de
 * `equipment_guidance` (que o prompt já consome) e também como `estilo_infra`.
 * Mesma cor e transparência em toda prévia: é o que faz duas prévias
 * diferentes parecerem da mesma família.
 */
const COMUM =
  "X-ray style is always the same: the covering surface becomes about 35% transparent ONLY along the route, with a soft light-blue edge glow; inside it, two copper pipes with black foam insulation, one white drain hose with continuous downward slope, and one grey power cable, running from the indoor unit to the exit point. NO letters, numbers, labels or arrows anywhere. Do not change anything outside the unit and its route.";

export function diretrizRaioX(tipo: string, tubulacao: string | null): string {
  const t = tipo.trim().toLowerCase();
  if (t === "janela") return "";
  const tub = (tubulacao ?? "").toLowerCase();
  let caso: string;
  if (t === "cassete" || t === "dutado" || tub.includes("forro")) {
    caso = "Show the infrastructure running above the ceiling: the plaster/PVC ceiling becomes translucent over the route (x-ray).";
  } else if (tub.includes("canaleta")) {
    caso = "Show a semi-transparent white PVC wall duct (canaleta) fixed on the wall surface, with the pipes, drain and cable visible inside it.";
  } else if (tub.includes("sem canaleta")) {
    caso = "Show the insulated pipes, drain and cable exposed on the wall, neatly bundled and fixed with white clamps, no duct.";
  } else {
    caso = "Show the infrastructure inside the wall: a translucent cut-away of the masonry/drywall (x-ray) along the route.";
  }
  return `${caso} ${COMUM}`;
}
```

Note: `tub.includes("canaleta")` is checked before `"sem canaleta"` would match — reorder so `"sem canaleta"` is tested first:

```ts
  } else if (tub.includes("sem canaleta")) {
    ...clamps...
  } else if (tub.includes("canaleta")) {
    ...duct...
  }
```
(use this order in the file.)

- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git add src/lib/server/diretriz-raio-x* && git commit -m "feat(previa): diretriz padronizada de raio-x da infraestrutura"`

---

### Task 8: Cena da condensadora como módulo + 5 locais

**Files:**
- Create: `src/lib/server/cena-condensadora.ts`
- Modify: `src/app/api/generate-image/condensadora-local/route.ts`

- [ ] **Step 1: Create the module**

```ts
import { N8N_CONDENSADORA_WEBHOOK } from "@/lib/env";
import type { LocalCondensadora } from "@/lib/alertas-instalacao";

/**
 * Pede ao n8n a cena ilustrativa da condensadora instalada no tipo de local
 * escolhido (não é o local real do cliente — não temos foto dele). Usado pela
 * geração principal (em paralelo) e pelo botão sob demanda do painel.
 *
 * Lança em qualquer falha: quem chama decide o fallback.
 */
export async function gerarCenaCondensadora(args: {
  leadId: string;
  tipoLocal: LocalCondensadora;
  productImageBase64: string | null;
}): Promise<string> {
  const res = await fetch(N8N_CONDENSADORA_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      lead_id: args.leadId,
      tipo_local: args.tipoLocal,
      product_image_base64: args.productImageBase64 ? `data:image/jpeg;base64,${args.productImageBase64}` : null,
    }),
  });
  const texto = await res.text();
  if (!res.ok || !texto.trim()) throw new Error(`n8n condensadora HTTP ${res.status}: ${texto.slice(0, 300) || "(corpo vazio)"}`);
  const url = (JSON.parse(texto) as Record<string, unknown>).url_imagem_final;
  if (typeof url !== "string" || !url) throw new Error("n8n condensadora não devolveu url_imagem_final");
  return url;
}
```

- [ ] **Step 2: Refactor the route.** In `condensadora-local/route.ts`:
  - Replace `const TIPOS_LOCAL = [...] as const; type TipoLocal = ...` with
    ```ts
    import { LOCAIS_CONDENSADORA, type LocalCondensadora } from "@/lib/alertas-instalacao";
    import { gerarCenaCondensadora } from "@/lib/server/cena-condensadora";
    const TIPOS_LOCAL = LOCAIS_CONDENSADORA.map((l) => l.chave);
    type TipoLocal = LocalCondensadora;
    ```
  - Add to `TITULOS`: `parede_externa: "EM SUPORTE NA PAREDE EXTERNA", chao: "EM BASE NO CHÃO"`.
  - Add to `BULLETS_BASE`: `parede_externa: ["Suporte metálico nivelado, chumbado em parede estrutural"], chao: ["Base elevada e nivelada, longe de poças e de terra"]`.
  - Replace the whole `let n8nRes … const urlBruta …` block (lines 144-177) with:
    ```ts
    let urlBruta: string;
    try {
      urlBruta = await gerarCenaCondensadora({ leadId: leadId ?? crypto.randomUUID(), tipoLocal: tipo, productImageBase64 });
    } catch (err) {
      console.error("[condensadora-local]", err instanceof Error ? err.message : err);
      return Response.json({ error: "A automação de imagem não devolveu resultado. Verifique a execução no n8n." }, { status: 502 });
    }
    ```
  - Remove the now-unused `N8N_CONDENSADORA_WEBHOOK` import only if `assertEnv` no longer needs it (it does — keep).
- [ ] **Step 3: Run** `npm run typecheck && npx vitest run src/lib/server/acentos.test.ts` — PASS.
- [ ] **Step 4: Commit** `git add -A src/lib/server/cena-condensadora.ts src/app/api/generate-image/condensadora-local && git commit -m "refactor(condensadora): cena em módulo próprio e 5 locais"`

---

### Task 9: Tipos da prévia + anotações em modo prancha

**Files:**
- Modify: `src/lib/server/previa-tipos.ts`
- Modify: `src/lib/server/preview-annotations.ts:460-554`
- Test: `src/lib/server/preview-annotations.test.ts`

- [ ] **Step 1: `DadosOverlay`.** Remove `forcarV2`. Replace `unidadeExterna` doc+field with:

```ts
  /** Rótulo do local escolhido ("Telhado", "Chão (base)") — ou o texto livre
   *  antigo, em gerações anteriores a esta versão. */
  unidadeExterna: string | null;
  /** "8 m" — distância entre evaporadora e condensadora. */
  distanciaCondensadora: string | null;
  /** Cena ilustrativa da condensadora (JPEG em data URL). `null` = a moldura
   *  mostra os afastamentos mínimos em texto. */
  cenaCondensadoraBase64: string | null;
  /** Alertas de `alertasInstalacao()` — entram no topo do card de garantia. */
  alertas: string[];
  dreno: string | null;
  tensao: string | null;
```

- [ ] **Step 2: Failing test** — append to `preview-annotations.test.ts`:

```ts
describe("planoAnotacoes em modo prancha", () => {
  it("não reserva coluna de cards: callout pode cair do lado esquerdo do topo", () => {
    const normal = planoAnotacoes({ ...DADOS, modoInfra: "modelo_3d" }, MARCACAO, W, H, -1);
    const prancha = planoAnotacoes({ ...DADOS, modoInfra: "modelo_3d" }, MARCACAO, W, H, -1, { prancha: true });
    expect(titulos(prancha.nos)).toContain("EVAPORADORA");
    expect(prancha.nos.length).toBeGreaterThanOrEqual(normal.nos.length);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib/server/preview-annotations.test.ts` — FAIL (signature).

- [ ] **Step 4: Implement** in `planoAnotacoes`:
  - Signature: `export function planoAnotacoes(d: DadosOverlay, m: Marcacao, W: number, H: number, ladoTexto: 1 | -1, opcoes: { prancha?: boolean } = {}): PlanoAnotacoes {`
  - Wrap the four `aloc.reservar(...)` calls for cards/selo/lembretes/rodapé (lines 487-494) in `if (!opcoes.prancha) { … }` with a comment: `// Na prancha a moldura mora numa faixa ao lado da foto — nada dela cai sobre a cena.` Keep the reservation of the equipment itself outside the `if`.
  - Replace `const rotaVisivel = recortarNaColuna(rotaPx, bordaCards, ladoTexto === 1 ? 1 : -1);` with `const rotaVisivel = opcoes.prancha ? rotaPx : recortarNaColuna(rotaPx, bordaCards, ladoTexto === 1 ? 1 : -1);`
- [ ] **Step 5: Run** test — PASS. `npm run typecheck` will now fail in `installation-overlay.ts`/`route.ts` for the new required fields; that is fixed in Tasks 10-11.
- [ ] **Step 6: Commit** `git add src/lib/server/previa-tipos.ts src/lib/server/preview-annotations* && git commit -m "feat(previa): dados da prancha e anotações sem coluna de cards"`

---

### Task 10: Prancha Arcil

**Files:**
- Rewrite: `src/lib/server/installation-overlay.ts`
- Rewrite: `src/lib/server/installation-overlay.test.ts`
- Delete: `src/lib/server/layouts/cassette-commercial-layout.ts`, `V2_CASSETTE_LAYOUT` in `src/lib/env.ts`

- [ ] **Step 1: Rewrite the test**

```ts
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { comporPrevia, ALTURA_PRANCHA, LARGURA_FAIXA } from "./installation-overlay";
import type { DadosOverlay } from "./previa-tipos";

async function cenaSintetica(W: number, H: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b8378"/><stop offset="34%" stop-color="#6f6a63"/>
      <stop offset="35%" stop-color="#b5a48f"/><stop offset="100%" stop-color="#5c5148"/>
    </linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const BASE: DadosOverlay = {
  produto: "Ar Condicionado Split Hi-Wall 12000 BTUs Inverter 220V",
  marca: "LG",
  sku: "S3-Q12JA31A",
  tipoEquipamento: "Split Hi-Wall",
  peDireito: "2,70 m",
  alturaInstalacao: "mín. 2,00 m a 2,30 m",
  distanciaTeto: "mín. 15 cm",
  espacamentoLateral: "mín. 15 cm a 30 cm",
  tubulacao: "Embutida na parede",
  pontoEletrico: false,
  alcapao: null,
  tipoForro: null,
  metragemInfra: null,
  alturaGabineteCm: 29,
  larguraGabineteCm: 84,
  origemDimensoes: "padrao_estimado",
  produtoImagemBase64: null,
  recomendacoesGarantia: ["Tubulação frigorígena de cobre 100% isolada individualmente", "Teste de vácuo abaixo de 500 microns obrigatório"],
  unidadeExterna: "Sacada técnica",
  distanciaCondensadora: "6 m",
  nivelCondensadora: "Mesmo nível do ambiente",
  cenaCondensadoraBase64: null,
  alertas: ["Executar ponto elétrico exclusivo, com disjuntor dedicado e aterramento."],
  dreno: "Para fora pela parede",
  tensao: "220 V",
  capacidade: "12.000 BTU/h",
  marcacao: null,
  urlPrevia: "https://arcil.com.br",
  modoInfra: "modelo_3d",
};

const COM_MARCACAO: DadosOverlay = {
  ...BASE,
  marcacao: { caixa: { x: 0.38, y: 0.2, w: 0.24, h: 0.08 }, rota: [{ x: 0.62, y: 0.24 }, { x: 0.8, y: 0.2 }] },
};

async function render(nome: string, dados: DadosOverlay, W: number, H: number) {
  const saida = await comporPrevia(await cenaSintetica(W, H), dados);
  if (process.env.PREVIA_DUMP) {
    fs.mkdirSync(process.env.PREVIA_DUMP, { recursive: true });
    fs.writeFileSync(path.join(process.env.PREVIA_DUMP, `${nome}.png`), saida);
  }
  return sharp(saida).metadata();
}

describe("comporPrevia (prancha)", () => {
  it("paisagem: altura padrão, largura = cena escalada + faixa", async () => {
    const meta = await render("prancha-paisagem", COM_MARCACAO, 1536, 864);
    expect(meta.height).toBe(ALTURA_PRANCHA);
    expect(meta.width).toBe(Math.round((1536 * ALTURA_PRANCHA) / 864) + LARGURA_FAIXA);
  }, 30_000);

  it("retrato, sem marcação", async () => {
    const meta = await render("prancha-retrato-sem-marcacao", BASE, 900, 1600);
    expect(meta.height).toBe(ALTURA_PRANCHA);
    expect(meta.width).toBe(900 + LARGURA_FAIXA);
  }, 30_000);

  it("com cena da condensadora", async () => {
    const cond = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a8a99" } }).jpeg().toBuffer();
    const meta = await render("prancha-com-condensadora", { ...COM_MARCACAO, cenaCondensadoraBase64: `data:image/jpeg;base64,${cond.toString("base64")}` }, 1536, 864);
    expect(meta.height).toBe(ALTURA_PRANCHA);
  }, 30_000);

  it("cassete com vários alertas não estoura a faixa", async () => {
    const meta = await render("prancha-cassete", {
      ...COM_MARCACAO,
      tipoEquipamento: "Cassete",
      tipoForro: "Gesso",
      alcapao: true,
      alertas: ["Alerta um bem comprido para quebrar linha na faixa lateral da prancha.", "Alerta dois.", "Alerta três.", "Alerta quatro."],
      recomendacoesGarantia: ["Um", "Dois", "Três", "Quatro"],
    }, 1536, 864);
    expect(meta.height).toBe(ALTURA_PRANCHA);
  }, 30_000);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/server/installation-overlay.test.ts` — FAIL.

- [ ] **Step 3: Rewrite `installation-overlay.ts`.** Keep from the current file: imports of `satori`, `sharp`, `QRCode`, the `TRACO`/`attrs`/`ICONE_*` constants (lines 54-63) and `iconeGarantiaPara` (114-122), and `qrDataUrl` (549-557). Delete everything else (passos, logoNo, qrNo, cards, camadaAncorada, camadaCards, camadaCassetteV2, topo/base/especificacoes/spec/cartao) and write:

```ts
import satori from "satori";
import sharp from "sharp";
import QRCode from "qrcode";
import { el, img, b64svg, fontes, logoArcilClaro, type No } from "./satori-nodes";
import { planoAnotacoes, legendaInfraNo, svgDasLinhas } from "./preview-annotations";
import { tubulacaoPeloModelo, type DadosOverlay } from "./previa-tipos";
import { nomeComMarca, semPontoFinal } from "./texto-previa";
import { CONDENSADORA_BULLETS } from "@/constants/hvac-standards";
import { AZUL, CLARO, CINZA, RODAPE_LEGAL } from "@/constants/arcil-brand";

export type { DadosOverlay } from "./previa-tipos";

/**
 * Prancha Arcil: a foto do cliente inteira à esquerda, sem nada por cima além
 * do que está preso ao aparelho (legendas com linha, cota, fluxo de ar), e uma
 * faixa fixa à direita com condensadora, modelo, garantia, QR e assinatura.
 *
 * Antes os cards eram desenhados POR CIMA da foto e cobriam ~1/4 do ambiente;
 * o cliente quer ver a casa dele. Altura fixa e faixa fixa fazem toda prévia
 * ter a mesma cara, seja a foto em pé ou deitada.
 */
export const ALTURA_PRANCHA = 1600;
export const LARGURA_FAIXA = 480;

const FAIXA_FUNDO = "#0B1220";
const CARTAO_FUNDO = "#121B2C";
const CARTAO_BORDA = "rgba(255,255,255,0.10)";
const AMBAR = "#F5C542";
const PAD = 26;
const INTERNA = LARGURA_FAIXA - PAD * 2;

// (ícones TRACO/ICONE_* e iconeGarantiaPara mantidos do arquivo anterior)

function titulo(texto: string): No {
  return el("div", { fontSize: 13, fontWeight: 700, color: AZUL, letterSpacing: 1.2, marginBottom: 8 }, texto);
}

function cartao(...filhos: (No | null)[]): No {
  return el(
    "div",
    { width: INTERNA, flexDirection: "column", background: CARTAO_FUNDO, border: `1px solid ${CARTAO_BORDA}`, borderRadius: 12, padding: 14 },
    ...filhos
  );
}

function cartaoCondensadora(d: DadosOverlay): No | null {
  if (d.tipoEquipamento.trim().toLowerCase() === "janela") return null;
  const largura = INTERNA - 28;
  const local = d.unidadeExterna ? semPontoFinal(d.unidadeExterna) : null;
  const linha = [local, d.distanciaCondensadora ? `${d.distanciaCondensadora} da evaporadora` : null, d.nivelCondensadora ? semPontoFinal(d.nivelCondensadora).toLowerCase() : null]
    .filter(Boolean)
    .join(" · ");
  return cartao(
    titulo("CONDENSADORA"),
    d.cenaCondensadoraBase64
      ? el(
          "div",
          { flexDirection: "column" },
          img(d.cenaCondensadoraBase64, { width: largura, height: Math.round(largura * 0.62), objectFit: "cover", borderRadius: 8 }),
          el("div", { fontSize: 11, fontStyle: "italic", color: CINZA, marginTop: 6 }, "Ilustração: forma correta de instalação")
        )
      : el(
          "div",
          { flexDirection: "column" },
          el("div", { fontSize: 11, color: CINZA, marginBottom: 4 }, "Afastamentos mínimos:"),
          ...CONDENSADORA_BULLETS.map((b) => el("div", { fontSize: 12, color: CLARO, lineHeight: 1.4 }, `• ${b}`))
        ),
    linha ? el("div", { fontSize: 13, color: CLARO, marginTop: 8, lineHeight: 1.35, width: largura }, linha) : null
  );
}

function cartaoModelo(d: DadosOverlay): No {
  const largura = INTERNA - 28;
  return cartao(
    titulo("MODELO"),
    d.produtoImagemBase64
      ? el(
          "div",
          { width: largura, height: Math.round(largura * 0.46), background: "#FFFFFF", borderRadius: 8, justifyContent: "center", alignItems: "center", marginBottom: 8 },
          img(d.produtoImagemBase64, { width: largura - 12, height: Math.round(largura * 0.46) - 12, objectFit: "contain" })
        )
      : null,
    el("div", { fontSize: 14, fontWeight: 700, color: CLARO, lineHeight: 1.3, width: largura }, nomeComMarca(d.produto, d.marca) || d.produto),
    d.capacidade || d.sku
      ? el("div", { fontSize: 12, color: CINZA, marginTop: 4 }, [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · "))
      : null
  );
}

function itemIcone(icone: string, texto: string, cor: string): No {
  return el(
    "div",
    { alignItems: "flex-start", marginBottom: 7, width: INTERNA - 28 },
    img(b64svg(icone), { width: 16, height: 16, marginRight: 8, marginTop: 1, flexShrink: 0 }),
    el("div", { fontSize: 12, color: cor, lineHeight: 1.38, flex: 1 }, texto)
  );
}

const ICONE_ALERTA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z" fill="none" stroke="${AMBAR}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v5M12 18v.5" stroke="${AMBAR}" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function cartaoGarantia(d: DadosOverlay): No | null {
  // Alertas primeiro: são o que muda de uma instalação para outra. Máximo de 7
  // linhas no total para a faixa nunca estourar a altura fixa.
  const alertas = d.alertas.slice(0, 4);
  const recomendacoes = d.recomendacoesGarantia.slice(0, Math.max(0, 7 - alertas.length));
  if (alertas.length === 0 && recomendacoes.length === 0) return null;
  return cartao(
    titulo("CUIDADOS PARA A GARANTIA"),
    ...alertas.map((a) => itemIcone(ICONE_ALERTA, a, AMBAR)),
    ...recomendacoes.map((r) => itemIcone(iconeGarantiaPara(r), r, CLARO))
  );
}

async function faixa(d: DadosOverlay, x: number, qr: string | null): Promise<No> {
  const logo = await logoArcilClaro();
  return el(
    "div",
    { position: "absolute", left: x, top: 0, width: LARGURA_FAIXA, height: ALTURA_PRANCHA, background: FAIXA_FUNDO, flexDirection: "column", padding: PAD, gap: 16 },
    logo ? img(logo, { width: 190, height: 53, objectFit: "contain", opacity: 0.9 }) : null,
    cartaoCondensadora(d),
    cartaoModelo(d),
    // No modo `vetorial` o CRM desenha o feixe colorido e a legenda explica as cores.
    !tubulacaoPeloModelo(d.modoInfra) ? legendaInfraNo(INTERNA) : null,
    cartaoGarantia(d),
    el(
      "div",
      { marginTop: "auto", flexDirection: "column", gap: 10 },
      qr
        ? el(
            "div",
            { alignItems: "center", gap: 12 },
            el("div", { width: 92, height: 92, background: "#FFFFFF", borderRadius: 10, justifyContent: "center", alignItems: "center" }, img(qr, { width: 80, height: 80 })),
            el("div", { fontSize: 12, color: CLARO, width: INTERNA - 104 }, d.qrEhManual ? "Manual de instalação do fabricante" : "Conheça a ARCIL")
          )
        : null,
      el("div", { fontSize: 10, color: CINZA, lineHeight: 1.35, width: INTERNA }, RODAPE_LEGAL),
      el("div", { fontSize: 9, color: "rgba(169,184,206,0.7)", fontStyle: "italic" }, "Imagem gerada pela IA da Arcil")
    )
  );
}

async function qrDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0B1220", light: "#FFFFFF" } });
  } catch (err) {
    console.error("[comporPrevia] QR não gerado:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Compõe a prancha: cena escalada para `ALTURA_PRANCHA` + faixa à direita.
 * Devolve PNG — quem chama faz o único encode JPEG (cada reencode perde
 * qualidade).
 */
export async function comporPrevia(cena: Buffer, dados: DadosOverlay): Promise<Buffer> {
  const cenaNorm = await sharp(cena).resize({ height: ALTURA_PRANCHA }).png().toBuffer();
  const larguraCena = (await sharp(cenaNorm).metadata()).width ?? ALTURA_PRANCHA;
  const W = larguraCena + LARGURA_FAIXA;
  const H = ALTURA_PRANCHA;

  // Callouts do lado com mais parede livre em relação ao aparelho.
  const plano = dados.marcacao
    ? planoAnotacoes(dados, dados.marcacao, larguraCena, H, dados.marcacao.caixa.x + dados.marcacao.caixa.w / 2 <= 0.5 ? 1 : -1, { prancha: true })
    : { linhas: "", nos: [] as No[] };

  const arvore = el(
    "div",
    { width: W, height: H, position: "relative", fontFamily: "Montserrat" },
    plano.linhas ? img(svgDasLinhas(plano.linhas, larguraCena, H), { position: "absolute", left: 0, top: 0, width: larguraCena, height: H }) : null,
    ...plano.nos,
    await faixa(dados, larguraCena, await qrDataUrl(dados.urlPrevia))
  );

  const svg = await satori(arvore as never, { width: W, height: H, fonts: fontes() });
  const camada = await sharp(Buffer.from(svg)).png().toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: FAIXA_FUNDO } })
    .composite([{ input: cenaNorm, left: 0, top: 0 }, { input: camada, left: 0, top: 0 }])
    .png()
    .toBuffer();
}
```

Check `svgDasLinhas` signature before using (`grep -n "export function svgDasLinhas" src/lib/server/preview-annotations.ts`) — it returns an `img` src string in the current code (`img(svgDasLinhas(plano.linhas, W, H), …)`), so the call above matches. Check `legendaInfraNo(largura)` returns `No`.

- [ ] **Step 4: Delete V2.** `git rm src/lib/server/layouts/cassette-commercial-layout.ts` (and the folder if empty), delete `V2_CASSETTE_LAYOUT` from `src/lib/env.ts`, remove the `V2_CASSETTE_LAYOUT` line from AGENTS.md "Opcionais", and the V2 token block in `arcil-brand.ts` **only if** `grep -rn "V2_" src` shows no other user. If `install-schematic.ts` is no longer imported anywhere (`grep -rn "install-schematic" src`), `git rm` it too.
- [ ] **Step 5: Run** `npx vitest run src/lib/server/installation-overlay.test.ts src/lib/server/acentos.test.ts` — PASS. Then render for eyes: `PREVIA_DUMP=D:/Temp/claude/previa npx vitest run src/lib/server/installation-overlay.test.ts` and open the PNGs with the Read tool; fix overflow/overlap before committing.
- [ ] **Step 6: Commit** `git add -A src AGENTS.md && git commit -m "feat(previa): prancha Arcil com faixa lateral fixa"`

---

### Task 11: Rota `/api/generate-image`

**Files:**
- Modify: `src/app/api/generate-image/route.ts`

- [ ] **Step 1: Body and collected data.** Remove `interface ApiMessage`, `messages` from the destructured body and its type. Add `cenaUrl?: string; condensadoraUrl?: string;` to the body type (they come back on an "ajuste"). Replace the extraction block (`// Extract structured data from conversation` … `} catch {}`) with:

```ts
  // O wizard manda respostas fechadas; não há conversa para "extrair" — a
  // chamada ao GPT que fazia isso trocava valor ("embutida" virou "canaleta").
  const collectedData: Record<string, unknown> = {};
```

  After the existing `if (answers?.metragem_infra) …` line add:

```ts
  if (answers?.ambiente) collectedData.ambiente = answers.ambiente;
  if (answers?.local_condensadora) collectedData.unidade_externa = answers.local_condensadora;
  if (answers?.distancia_condensadora) collectedData.distancia_condensadora = answers.distancia_condensadora;
  if (answers?.dreno) collectedData.dreno = answers.dreno;
  if (answers?.tensao) collectedData.tensao = answers.tensao;
  if (answers?.obstaculos) collectedData.obstaculos = answers.obstaculos;
```

  (`unidade_externa` continues to be the payload key n8n already reads; new wizard fills it from the closed choice.)

- [ ] **Step 2: Validate the reused URLs** right after the `referenceImageUrl` validation, same allow-list pattern (`/storage/v1/object/public/PDF/`) for `cenaUrl` and `condensadoraUrl`; invalid → 400. Then: `const referenciaAjuste = cenaUrl ?? referenceImageUrl;` and use `referenciaAjuste` wherever `referenceImageUrl` is used below (fetch for `referenceImageBase64`, `reference_image_url`, `generation_mode`). Reason (comment): the final prancha has the side band; the model must receive the raw scene.

- [ ] **Step 3: Prompt lines.** In the `prompt` array add after `Tubulação`:

```ts
    collectedData.ambiente ? `Ambiente: ${collectedData.ambiente}` : null,
    collectedData.distancia_condensadora ? `Distância até a condensadora: ${collectedData.distancia_condensadora}` : null,
    collectedData.dreno ? `Dreno: ${collectedData.dreno}` : null,
```

  And change `technicalGuidance` to:

```ts
  const raioX = diretrizRaioX(String(collectedData.tipo_equipamento ?? ""), typeof collectedData.tubulacao === "string" ? collectedData.tubulacao : null);
  const technicalGuidance = [comDiretrizNbr(collectedData.tipo_equipamento, equipmentGuidance(collectedData.tipo_equipamento), equipmentSpecs), raioX].filter(Boolean).join(" ");
```

  Add `estilo_infra: raioX || null,` to the n8n body. Import `diretrizRaioX`.

- [ ] **Step 4: Condensadora in parallel.** After `const productImageBase64 = await fetchProductImageBase64(productImageUrl);` add:

```ts
  // Cena da condensadora em paralelo com a principal: o tempo total fica o da
  // mais lenta, não a soma. No ajuste, reaproveita a que já existe (custo).
  const tipoLocal = chaveDoLocal(answers?.local_condensadora);
  const condensadoraPromise: Promise<string | null> = condensadoraUrl
    ? Promise.resolve(condensadoraUrl)
    : tipoLocal && N8N_CONDENSADORA_WEBHOOK
      ? gerarCenaCondensadora({ leadId: `${leadId}-cond`, tipoLocal, productImageBase64 }).catch((err) => {
          console.error("[generate-image] cena da condensadora falhou:", err instanceof Error ? err.message : err);
          return null;
        })
      : Promise.resolve(null);
```

  Imports: `chaveDoLocal, alertasInstalacao` from `@/lib/alertas-instalacao`, `gerarCenaCondensadora` from `@/lib/server/cena-condensadora`, `N8N_CONDENSADORA_WEBHOOK` from `@/lib/env`.

- [ ] **Step 5: Generation loop with inspector.** Set `const MAX_TENTATIVAS_GERACAO = 2;` (comment: teto de custo — uma regeneração, por vazamento da guia ou por reprovação do inspetor). Declare before the loop: `let cenaBuffer: Buffer | null = null; let inspecao: ResultadoInspecao | null = null;`. Replace the block from `if (marcacao && guideImageBase64) {` through `break;` with:

```ts
    let cenaDestaTentativa: Buffer | null = null;
    try {
      const cenaRes = await fetch(urlDestaTentativa);
      if (cenaRes.ok) cenaDestaTentativa = Buffer.from(await cenaRes.arrayBuffer());
    } catch (err) {
      console.error("[generate-image] não consegui reler a cena:", err instanceof Error ? err.message : err);
    }

    const ultima = tentativa === MAX_TENTATIVAS_GERACAO;
    if (cenaDestaTentativa && marcacao && guideImageBase64 && (await detectarVazamentoDaGuia(cenaDestaTentativa))) {
      console.error(`[generate-image] guia vazou na tentativa ${tentativa}/${MAX_TENTATIVAS_GERACAO}`);
      if (!ultima) continue;
      vazamentoPersistente = true;
    }

    inspecao =
      cenaDestaTentativa && fotoBuffer
        ? await inspecionarCena({
            foto: fotoBuffer,
            cena: cenaDestaTentativa,
            produto: productImageBase64 ? Buffer.from(productImageBase64, "base64") : null,
            tipo: String(collectedData.tipo_equipamento ?? ""),
            tubulacao: typeof collectedData.tubulacao === "string" ? collectedData.tubulacao : null,
          })
        : null;
    if (inspecao && deveRegenerar(inspecao, String(collectedData.tipo_equipamento ?? "")) && !ultima && !vazamentoPersistente) {
      console.error(`[generate-image] inspetor reprovou a tentativa ${tentativa}:`, inspecao.motivo);
      continue;
    }

    generatedImageUrl = urlDestaTentativa;
    cenaBuffer = cenaDestaTentativa;
    break;
```

  Import `inspecionarCena, deveRegenerar, motivoDaInspecao, type ResultadoInspecao` from `@/lib/server/inspetor-cena`.

- [ ] **Step 6: Compose.** Before `comporEEnviar`, add:

```ts
  const condensadoraFinalUrl = await condensadoraPromise;
  const cenaCondensadoraBase64 = condensadoraFinalUrl ? await fetchImagemBase64(condensadoraFinalUrl, 1024) : null;
```

  In the `DadosOverlay` object passed to `comporEEnviar`: remove `metragemInfra` value → keep `metragemInfra: typeof collectedData.metragem_infra === "string" ? metragemLegivel(collectedData.metragem_infra) : null` (old generations), and add:

```ts
    distanciaCondensadora: typeof collectedData.distancia_condensadora === "string" ? collectedData.distancia_condensadora : null,
    cenaCondensadoraBase64: cenaCondensadoraBase64 ? `data:image/jpeg;base64,${cenaCondensadoraBase64}` : null,
    alertas: alertasInstalacao(answers ?? {}),
    dreno: typeof collectedData.dreno === "string" ? collectedData.dreno : null,
    tensao: typeof collectedData.tensao === "string" ? collectedData.tensao : null,
```

  Change `comporEEnviar(generatedImageUrl, leadId, {...})` to `comporEEnviar(generatedImageUrl, cenaBuffer, fotoBuffer, leadId, {...})` and its implementation to:

```ts
async function comporEEnviar(imageUrl: string, cena: Buffer | null, foto: Buffer | null, leadId: string, dados: DadosOverlay): Promise<string> {
  try {
    let cenaBuffer = cena;
    if (!cenaBuffer) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`fetch cena -> HTTP ${res.status}`);
      cenaBuffer = Buffer.from(await res.arrayBuffer());
    }
    const preservada = foto ? (await preservarFoto(foto, cenaBuffer, dados.marcacao)).imagem : cenaBuffer;
    const composta = await comporPrevia(preservada, dados);
    // …resto igual (jpeg 94, upload previa/{leadId}.jpg, publicUrl)
```

  Update its doc comment: remove the "Created by ARCIL AI" paragraph; say the prancha carries the signature "Imagem gerada pela IA da Arcil". Import `preservarFoto`.

- [ ] **Step 7: Warnings.** After the existing `posicionamento` block, add:

```ts
  const avisoInspecao = inspecao ? motivoDaInspecao(inspecao, String(collectedData.tipo_equipamento ?? "")) : null;
  if (avisoInspecao) {
    posicionamento = { ok: false, mensagem: posicionamento && !posicionamento.ok ? `${posicionamento.mensagem} ${avisoInspecao}` : avisoInspecao };
  }
```

- [ ] **Step 8: Notes only from people.** In `getInstallationNotes`, delete the whole `try { const content = await openAI(…) … }` fallback and return `{ installationNotes: null, notesSource: null }` when no `manual` row matches; change the match line to `const match = candidatos.find((n) => n.origem === "manual");`. Doc comment: "Texto de garantia só com responsável humano: as notas escritas pela IA ficam no banco, ignoradas." The `marca` parameter becomes unused — remove it from signature and call.

- [ ] **Step 9: Response.** `return Response.json({ imageUrl: finalImageUrl, cenaUrl: generatedImageUrl, condensadoraUrl: condensadoraFinalUrl, installationNotes, installationNotesSource: notesSource, posicionamento });`

- [ ] **Step 10: Run** `npm run typecheck && npx eslint src e2e scripts && npm run test` — all PASS (fix any unused import: `ApiMessage`, `metragemLegivel` still used, `openAI` still used by Vision/posicionamento).
- [ ] **Step 11: Commit** `git commit -am "feat(gerador): cena e condensadora em paralelo, inspetor, foto preservada e prancha"`

---

### Task 12: Tela do wizard

**Files:**
- Modify: `src/app/chatbot/page.tsx`, `src/app/chatbot/_components/group-form.tsx`, `src/app/chatbot/_components/resultado-painel.tsx`

- [ ] **Step 1: `Versao`** (resultado-painel.tsx): add `cenaUrl?: string | null; condensadoraUrl?: string | null;`. Change `CUSTO_APROX_GERACAO` to `"R$ 1,65"`. Extend `TIPOS_CONDENSADORA` with `["parede_externa", "Parede externa"]`, `["chao", "No chão"]`, and widen every `"telhado" | "laje_tecnica" | "sacada_tecnica"` union in this file and in `page.tsx` to `LocalCondensadora` (import type from `@/lib/alertas-instalacao`).
- [ ] **Step 2: page.tsx request.** Delete `ApiMessage` type and `buildAnswersForApi`; remove `messages` from the body and `buildAnswersForApi` from the `useCallback` deps; `buildSteps` import goes if unused. Revision signature becomes `revision?: { referenceImageUrl?: string; cenaUrl?: string | null; condensadoraUrl?: string | null; revisionPrompt?: string }` and the body sends `cenaUrl: revision?.cenaUrl ?? undefined, condensadoraUrl: revision?.condensadoraUrl ?? undefined`. In `setVersoes` store `cenaUrl: (data.cenaUrl as string | null) ?? null, condensadoraUrl: (data.condensadoraUrl as string | null) ?? null`. In `requestRevision`: `const v = versoes[versaoAtiva]; … requestGeneration(answers, { referenceImageUrl: v.imageUrl, cenaUrl: v.cenaUrl, condensadoraUrl: v.condensadoraUrl, revisionPrompt: … })`.
- [ ] **Step 3: on-demand condensadora** sends `distanciaTexto: answers.distancia_condensadora || answers.unidade_externa || null` (deps updated).
- [ ] **Step 4: Alerts on screen.** `GroupForm` gets an optional prop `alertas?: string[]` rendered after the fields:

```tsx
      {alertas && alertas.length > 0 && (
        <div className="space-y-1.5 rounded-[8px] border border-amber-500/40 bg-amber-500/10 p-3">
          {alertas.map((a) => (
            <p key={a} className="text-[11px] leading-relaxed text-amber-200">{a}</p>
          ))}
        </div>
      )}
```

  In `page.tsx` pass `alertas={alertasInstalacao({ ...answers, ...rascunho })}` to `<GroupForm>`.
- [ ] **Step 5: Run** `npm run typecheck && npx eslint src e2e scripts && npm run test` — PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(gerador): alertas no wizard e ajuste reaproveita cena e condensadora"`

---

### Task 13: Remover `/api/chat`

- [ ] **Step 1:** `grep -rn "api/chat" src e2e` must show only `src/proxy.ts`. Then `git rm -r src/app/api/chat`, delete the `"/api/chat": 30,` line in `src/proxy.ts`, and the `chat/` line in AGENTS.md's folder tree. If `src/types/api.ts` has types used only by that route (`grep -n "Chat" src/types/api.ts`), remove them.
- [ ] **Step 2: Run** `npm run typecheck && npm run build` — PASS (build catches route removal issues). If `build` fails with `Cannot find module 'sharp'`, run `npm install` (AGENTS.md trap) and retry.
- [ ] **Step 3: Commit** `git commit -am "chore(gerador): remove rota /api/chat sem chamador"`

---

### Task 14: n8n runbook + validação local

**Files:**
- Create: `docs/runbooks/n8n-padrao-imagem-arcil.md`

- [ ] **Step 1: Runbook** (pt-BR) with: (a) the CRM now sends `estilo_infra` and appends the x-ray text to `equipment_guidance` — check in one execution of workflow `PVtyGZ6gQrBABe83` that the node **MONTA PROMPT SEEDREAM** includes `equipment_guidance` in the final prompt; if it doesn't, add `${$json.body.estilo_infra ?? ''}` to the prompt string; (b) the condensadora webhook receives `tipo_local` = `parede_externa` and `chao`; add prompt cases ("outdoor condenser unit mounted on a metal wall bracket on an exterior masonry wall, level, 15 cm from the wall" / "outdoor condenser unit on a raised concrete base on the ground, level, free airflow around it"); (c) reload the n8n editor tab before editing (AGENTS.md trap).
- [ ] **Step 2: Local run.** `npm run dev`, open `http://localhost:3000/chatbot`, do one full Hi-Wall flow with a real photo + marcação. Check: questions accented; alerts appear; final image is a prancha (photo + right band); condensadora frame filled (or afastamentos if n8n lacks the new local); signature present; ajuste keeps the band out of the reference. Read the server log for `[preservarFoto]` (if it always says "desalinhada", calibrate `LIMIAR_DESALINHO` with the logged value) and `[inspetor-cena]`.
- [ ] **Step 3: Commit** `git add docs/runbooks/n8n-padrao-imagem-arcil.md && git commit -m "docs(n8n): runbook do padrão de imagem Arcil"`. **Do not push.** Hand over to the owner for local review.
