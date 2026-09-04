# Redesign do fluxo /chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a metáfora de bolha de chat em `/chatbot` por um wizard de tela cheia com
grupos de perguntas por tema, redesenhar a marcação na foto como etapa própria com dois modos
explícitos (posicionar aparelho / desenhar tubulação em traço livre), e reorganizar a tela de
resultado em abas.

**Architecture:** Front-end puro (ver spec, seção "Contexto" — `route.ts` só lê `answers`
estruturado e `marcacao {caixa, rota}`, não a apresentação). Extrai lógica pura de agrupamento
de perguntas pra `step-groups.ts` (testável com vitest), extrai a UI de campos pra
`group-form.tsx` e a UI de resultado pra `resultado-painel.tsx` — `page.tsx` fica só
orquestração de estado. Único ponto de backend tocado: `lib/marcacao.ts` para de cortar `rota`
em 2 pontos.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind CSS v4, `@radix-ui/react-tabs`
(já é dependência, primeiro uso), vitest (testes unitários existentes do projeto).

**Spec:** `docs/superpowers/specs/2026-09-01-chatbot-redesign-design.md`

---

## Nota sobre testes

Este projeto testa lógica pura com vitest em ambiente `node` (sem jsdom, sem
`@testing-library/react` — ver `vitest.config.ts`). Não existe hoje nenhum teste de
renderização de componente React no repositório. Por isso:

- **Task 1 e Task 2** (lógica pura, sem JSX) seguem TDD normal: teste falha → implementação →
  teste passa.
- **Tasks 3, 4, 5, 6** (componentes React com interação de ponteiro/gesto) não têm teste
  automatizado possível com a infra atual — cada uma termina com `npm run typecheck` e
  `npm run lint` como verificação mecânica, e a **Task 7** é a verificação funcional real:
  rodar `npm run dev` e usar a feature no navegador, exatamente como o usuário pediu.

## Task 1: `lib/marcacao.ts` aceita traço livre (remove corte pra 2 pontos)

**Files:**
- Modify: `src/lib/marcacao.ts`
- Test: `src/lib/marcacao.test.ts` (novo arquivo)

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/marcacao.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseMarcacao, type PontoFrac } from "./marcacao";

const caixaValida = { x: 0.3, y: 0.2, w: 0.2, h: 0.1 };

function linha(n: number): PontoFrac[] {
  return Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5 }));
}

describe("parseMarcacao", () => {
  it("retorna null sem caixa", () => {
    expect(parseMarcacao({ rota: [] })).toBeNull();
    expect(parseMarcacao(null)).toBeNull();
    expect(parseMarcacao("nao e objeto")).toBeNull();
  });

  it("rejeita caixa menor que o piso de tamanho", () => {
    expect(parseMarcacao({ caixa: { x: 0.5, y: 0.5, w: 0.01, h: 0.1 } })).toBeNull();
    expect(parseMarcacao({ caixa: { x: 0.5, y: 0.5, w: 0.1, h: 0.005 } })).toBeNull();
  });

  it("aceita marcação sem rota (aparelho sem infraestrutura desenhada)", () => {
    const m = parseMarcacao({ caixa: caixaValida });
    expect(m).not.toBeNull();
    expect(m!.rota).toEqual([]);
  });

  it("descarta um único ponto solto (toque acidental, não é caminho)", () => {
    const m = parseMarcacao({ caixa: caixaValida, rota: [{ x: 0.1, y: 0.1 }] });
    expect(m!.rota).toEqual([]);
  });

  it("aceita a reta de 2 pontos do formato anterior (arrasto único)", () => {
    const rota = [{ x: 0.5, y: 0.3 }, { x: 0.9, y: 0.3 }];
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toEqual(rota);
  });

  it("aceita um traço livre com dezenas de pontos, sem cortar", () => {
    const rota = linha(80);
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toHaveLength(80);
    expect(m!.rota).toEqual(rota);
  });

  it("aplica o teto de sanidade em traços acima de 200 pontos", () => {
    const rota = linha(350);
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toHaveLength(200);
    expect(m!.rota).toEqual(rota.slice(0, 200));
  });

  it("ignora pontos malformados dentro do traço sem descartar os válidos", () => {
    const rota = [{ x: 0.1, y: 0.1 }, { x: "bad", y: 0.2 }, { x: 0.3, y: 0.3 }] as unknown[];
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test -- marcacao.test.ts`
Expected: FAIL no teste "aceita um traço livre com dezenas de pontos, sem cortar" e no teste
do teto de 200 (o código atual corta em `.slice(0, 2)`).

- [ ] **Step 3: Implementar**

Em `src/lib/marcacao.ts`, substitua o bloco do tipo `Marcacao` (linhas 18-26 hoje) por:

```typescript
/** Teto de pontos aceitos em `rota`. O vendedor desenha o traço com o dedo
 *  (dezenas de pontos por segundo em `pointermove`); sem teto, um traço longo
 *  vira um payload desproporcional pro que ele carrega (uma polilinha, não
 *  geometria complexa). O cliente já filtra pontos muito próximos antes de
 *  mandar — isto aqui é só o piso de sanidade do servidor. */
const MAX_PONTOS_ROTA = 200;

export type Marcacao = {
  /** Onde o aparelho vai. Obrigatório — é o que dá posição E escala aparente. */
  caixa: CaixaFrac;
  /** Traço da tubulação/dreno/cabo, desenhado livre com o dedo — de 2 a
   *  `MAX_PONTOS_ROTA` pontos. Vazio quando pulou: a rota é sintetizada como
   *  antes (`preview-annotations.ts`). Aceita também os 2 pontos de um
   *  arrasto reto (formato anterior desta ferramenta) sem tratamento
   *  especial: uma reta é só o caso degenerado de um caminho. */
  rota: PontoFrac[];
};
```

E substitua o bloco que monta `rota` dentro de `parseMarcacao` (o `.slice(0, 2)`) por:

```typescript
  // Traço livre: todo ponto capturado durante o gesto, até o teto de sanidade.
  // Corte pra 2 pontos saiu daqui — era o que impedia o traço à mão livre de
  // chegar inteiro (`MAX_PONTOS_ROTA`, ver comentário do tipo `Marcacao`).
  const rota: PontoFrac[] = Array.isArray(o.rota)
    ? o.rota
        .map((p) => {
          const pp = p as Record<string, unknown>;
          const px = frac(pp?.x);
          const py = frac(pp?.y);
          return px == null || py == null ? null : { x: px, y: py };
        })
        .filter((p): p is PontoFrac => p !== null)
        .slice(0, MAX_PONTOS_ROTA)
    : [];
```

Nada mais no arquivo muda (o resto de `parseMarcacao` e `descreverMarcacao` já funcionam com
qualquer tamanho de `rota`).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test -- marcacao.test.ts`
Expected: PASS em todos os 7 testes.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add src/lib/marcacao.ts src/lib/marcacao.test.ts
git commit -m "feat: marcacao aceita traco livre de tubulacao, nao so reta de 2 pontos"
```

## Task 2: `step-groups.ts` — perguntas agrupadas por tema

**Files:**
- Create: `src/app/chatbot/_components/step-groups.ts`
- Test: `src/app/chatbot/_components/step-groups.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/app/chatbot/_components/step-groups.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildSteps, buildStepGroups, grupoRespondido, type StepGroup } from "./step-groups";

const TIPOS = [null, "Split Hi-Wall", "Cassete", "Dutado", "Piso-teto", "Janela"];

describe("buildStepGroups", () => {
  it.each(TIPOS)("cobre exatamente as mesmas perguntas que buildSteps para tipo=%s", (tipo) => {
    const chavesFlat = buildSteps(tipo).map((s) => s.key);
    const chavesAgrupadas = buildStepGroups(tipo).flatMap((g) => g.steps.map((s) => s.key));
    expect(chavesAgrupadas).toEqual(chavesFlat);
  });

  it("cada grupo tem título e pelo menos um campo, para todo tipo", () => {
    for (const tipo of TIPOS) {
      for (const grupo of buildStepGroups(tipo)) {
        expect(grupo.titulo.length).toBeGreaterThan(0);
        expect(grupo.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("Ambiente e aparelho junta ambiente e produto na primeira tela", () => {
    const grupos = buildStepGroups(null);
    expect(grupos[0].titulo).toBe("Ambiente e aparelho");
    expect(grupos[0].steps.map((s) => s.key)).toEqual(["ambiente", "produto"]);
  });

  it("Foto e Marcação são sempre grupos de 1 campo só", () => {
    for (const tipo of TIPOS) {
      const grupos = buildStepGroups(tipo);
      const foto = grupos.find((g) => g.titulo === "Foto")!;
      const marcacao = grupos.find((g) => g.titulo === "Marcação")!;
      expect(foto.steps).toHaveLength(1);
      expect(foto.steps[0].key).toBe("foto");
      expect(marcacao.steps).toHaveLength(1);
      expect(marcacao.steps[0].key).toBe("marcacao");
    }
  });

  it("Janela não pergunta condensadora — grupo Infraestrutura só tem metragem", () => {
    const infra = buildStepGroups("Janela").find((g) => g.titulo === "Infraestrutura")!;
    expect(infra.steps.map((s) => s.key)).toEqual(["metragem_infra"]);
  });

  it("Cassete separa Forro (4 campos) de Infraestrutura (4 campos, com tubulação)", () => {
    const grupos = buildStepGroups("Cassete");
    const forro = grupos.find((g) => g.titulo === "Forro")!;
    const infra = grupos.find((g) => g.titulo === "Infraestrutura")!;
    expect(forro.steps.map((s) => s.key)).toEqual(["tipo_forro", "pe_direito", "alcapao", "ponto_eletrico"]);
    expect(infra.steps.map((s) => s.key)).toEqual(["unidade_externa", "nivel_condensadora", "tubulacao", "metragem_infra"]);
  });
});

describe("grupoRespondido", () => {
  const grupo: StepGroup = {
    titulo: "Teste",
    steps: [
      { key: "a", question: "?", type: "text" },
      { key: "foto", question: "?", type: "file" },
    ],
  };

  it("false se algum campo de texto está vazio", () => {
    expect(grupoRespondido(grupo, {}, { temFoto: true, marcacaoRespondida: true })).toBe(false);
  });

  it("false se o widget de foto não sinaliza resposta, mesmo com o texto preenchido", () => {
    expect(grupoRespondido(grupo, { a: "x" }, { temFoto: false, marcacaoRespondida: true })).toBe(false);
  });

  it("true quando texto e widgets estão todos respondidos", () => {
    expect(grupoRespondido(grupo, { a: "x" }, { temFoto: true, marcacaoRespondida: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test -- step-groups.test.ts`
Expected: FAIL — `./step-groups` ainda não existe ("Cannot find module").

- [ ] **Step 3: Implementar**

Crie `src/app/chatbot/_components/step-groups.ts`:

```typescript
/**
 * Perguntas do questionário de instalação, e como agrupá-las em telas por
 * tema.
 *
 * `buildSteps()` é a fonte da verdade: um campo por entrada, ramificado pelo
 * tipo de equipamento (só se confirma na resposta do passo "produto").
 * `buildStepGroups()` agrupa esses mesmos campos em telas — nunca decide
 * sozinho quais perguntas existem, só como elas aparecem juntas. Por isso o
 * teste deste módulo compara `buildStepGroups(tipo)` "achatado" contra
 * `buildSteps(tipo)`: se alguém adicionar um campo novo a um ramo e esquecer
 * de colocá-lo num grupo, o teste quebra na hora em vez de o vendedor
 * simplesmente nunca ver aquela pergunta.
 */

export type Step =
  | { key: string; question: string; type: "text" }
  | { key: string; question: string; type: "file" }
  | { key: string; question: string; type: "produto" }
  | { key: string; question: string; type: "marcacao" }
  | { key: string; question: string; type: "medida"; unidades: ("m" | "cm")[] }
  | { key: string; question: string; type: "choice"; options: string[] };

export type StepGroup = { titulo: string; steps: Step[] };

const NIVEL_CONDENSADORA: Step = {
  key: "nivel_condensadora",
  question: "A condensadora fica acima, abaixo ou no mesmo nivel do ambiente?",
  type: "choice",
  options: ["Acima do ambiente", "Abaixo do ambiente", "Mesmo nivel do ambiente"],
};
const UNIDADE_EXTERNA: Step = {
  key: "unidade_externa",
  question: "Onde ficara a unidade externa (condensadora) e a que distancia aproximada?",
  type: "text",
};
const METRAGEM_INFRA: Step = {
  key: "metragem_infra",
  question: "Quantos metros de tubulação, dreno e cabo elétrico serão usados, aproximadamente?",
  type: "medida",
  unidades: ["m"],
};

/**
 * As perguntas de parede (tipo de parede, ponto elétrico "na parede",
 * tubulação "embutida na parede") só fazem sentido pro hi-wall. Um cassete
 * mora no forro, um dutado tem espaço técnico em vez de pé-direito de
 * parede, e uma janela é peça única sem condensadora separada — perguntar do
 * mesmo jeito pra todos gerava prévia certa só por acaso.
 *
 * `produto` vem cedo (logo depois de `ambiente`) porque é dali que o tipo sai
 * — sem saber o tipo ainda, não dá pra escolher qual ramo perguntar.
 */
export function buildSteps(tipo: string | null): Step[] {
  const inicio: Step[] = [
    { key: "ambiente", question: "Qual o ambiente da instalacao?", type: "text" },
    { key: "produto", question: "Qual o aparelho? Busque pelo código do ERP, modelo ou marca.", type: "produto" },
    { key: "foto", question: "Envie uma foto do ambiente", type: "file" },
    {
      key: "marcacao",
      question: "Marque na foto onde o aparelho vai e, se souber, pra onde a infraestrutura sai.",
      type: "marcacao",
    },
  ];

  if (tipo === "Cassete") {
    return [
      ...inicio,
      { key: "tipo_forro", question: "Qual o tipo do forro?", type: "choice", options: ["Gesso", "PVC", "Modular", "Outro"] },
      { key: "pe_direito", question: "Qual a altura entre a laje e o forro (plenum), no ponto de instalação?", type: "medida", unidades: ["cm", "m"] },
      { key: "alcapao", question: "A instalação deve incluir alçapão de inspeção?", type: "choice", options: ["Sim", "Não"] },
      { key: "ponto_eletrico", question: "Já existe ponto elétrico no forro, no local de instalação?", type: "choice", options: ["Sim", "Não"] },
      UNIDADE_EXTERNA,
      NIVEL_CONDENSADORA,
      { key: "tubulacao", question: "Tubulação e dreno correm embutidos ou aparentes sob o forro?", type: "choice", options: ["Embutidos no forro", "Aparentes sob o forro"] },
      METRAGEM_INFRA,
    ];
  }

  if (tipo === "Dutado") {
    return [
      ...inicio,
      { key: "tipo_forro", question: "Qual o tipo do forro onde a rede de dutos vai correr?", type: "choice", options: ["Gesso", "PVC", "Modular", "Outro"] },
      { key: "pe_direito", question: "Qual o espaço técnico disponível entre a laje e o forro (plenum)?", type: "medida", unidades: ["cm", "m"] },
      { key: "rede_dutos", question: "Já existe rede de dutos instalada ou sera nova?", type: "choice", options: ["Nova instalação", "Rede existente"] },
      { key: "ponto_eletrico", question: "Já existe ponto elétrico no espaço técnico?", type: "choice", options: ["Sim", "Não"] },
      UNIDADE_EXTERNA,
      NIVEL_CONDENSADORA,
      METRAGEM_INFRA,
    ];
  }

  if (tipo === "Piso-teto") {
    return [
      ...inicio,
      { key: "superficie_fixacao", question: "A unidade interna sera fixada no piso ou no teto?", type: "choice", options: ["Piso", "Teto"] },
      { key: "pe_direito", question: "Qual a altura do pe-direito?", type: "medida", unidades: ["m", "cm"] },
      { key: "ponto_eletrico", question: "Já existe ponto elétrico no local de instalação?", type: "choice", options: ["Sim", "Não"] },
      UNIDADE_EXTERNA,
      NIVEL_CONDENSADORA,
      { key: "tubulacao", question: "Tipo de tubulacao?", type: "choice", options: ["Embutida na parede", "Canaleta aparente", "Sem canaleta"] },
      METRAGEM_INFRA,
    ];
  }

  if (tipo === "Janela") {
    return [
      ...inicio,
      { key: "vao_janela", question: "O vão da janela/parede já existe ou sera aberto para instalação?", type: "choice", options: ["Vão já existe", "Sera aberto/adaptado"] },
      { key: "pe_direito", question: "Quais as medidas aproximadas do vão (largura x altura)?", type: "text" },
      { key: "ponto_eletrico", question: "Já existe ponto elétrico exclusivo próximo ao vão?", type: "choice", options: ["Sim", "Não"] },
      METRAGEM_INFRA,
    ];
  }

  // "Split Hi-Wall" e o estado inicial (tipo ainda não escolhido, antes do
  // passo "produto" responder) caem aqui.
  return [
    ...inicio,
    { key: "tipo_parede", question: "Qual o tipo da parede?", type: "choice", options: ["Alvenaria", "Drywall", "Outro"] },
    { key: "pe_direito", question: "Qual a altura do pe-direito?", type: "medida", unidades: ["m", "cm"] },
    { key: "ponto_eletrico", question: "Já existe ponto elétrico na parede?", type: "choice", options: ["Sim", "Não"] },
    UNIDADE_EXTERNA,
    NIVEL_CONDENSADORA,
    { key: "tubulacao", question: "Tipo de tubulacao?", type: "choice", options: ["Embutida na parede", "Canaleta aparente", "Sem canaleta"] },
    METRAGEM_INFRA,
  ];
}

/** Uma linha de explicação por campo técnico — a queixa original era pergunta
 *  técnica sem contexto ("ponto elétrico no forro", "plenum") largada
 *  sozinha. */
export const HINTS: Partial<Record<string, string>> = {
  tipo_forro: "Material do forro no ponto onde o aparelho vai ser embutido.",
  pe_direito: "Altura do chão até o teto, medida na parede onde a unidade vai.",
  alcapao: "Abertura de acesso pra manutenção, embutida no forro.",
  rede_dutos: "Os dutos que distribuem o ar já existem, ou serão instalados agora?",
  superficie_fixacao: "Onde a unidade interna fica presa: no chão ou pendurada no teto.",
  tipo_parede: "Material da parede onde a unidade vai ser fixada.",
  ponto_eletrico: "Tomada ou fiação exclusiva já disponível no local de instalação.",
  vao_janela: "Medida do espaço livre onde o aparelho encaixa — largura x altura.",
  unidade_externa: "Onde a condensadora vai ficar (telhado, laje técnica, sacada) e a que distância aproximada da evaporadora.",
  nivel_condensadora: "Compara a altura de onde a condensadora fica com a do ambiente climatizado.",
  tubulacao: "Se a tubulação de cobre e o dreno correm escondidos ou à mostra.",
  metragem_infra: "Soma aproximada de tubulação, dreno e cabo elétrico que serão usados.",
};

type GrupoTecnico = { titulo: string; chaves: string[] };

const GRUPOS_TECNICOS: Record<string, GrupoTecnico[]> = {
  Cassete: [
    { titulo: "Forro", chaves: ["tipo_forro", "pe_direito", "alcapao", "ponto_eletrico"] },
    { titulo: "Infraestrutura", chaves: ["unidade_externa", "nivel_condensadora", "tubulacao", "metragem_infra"] },
  ],
  Dutado: [
    { titulo: "Forro e dutos", chaves: ["tipo_forro", "pe_direito", "rede_dutos", "ponto_eletrico"] },
    { titulo: "Infraestrutura", chaves: ["unidade_externa", "nivel_condensadora", "metragem_infra"] },
  ],
  "Piso-teto": [
    { titulo: "Estrutura", chaves: ["superficie_fixacao", "pe_direito", "ponto_eletrico"] },
    { titulo: "Infraestrutura", chaves: ["unidade_externa", "nivel_condensadora", "tubulacao", "metragem_infra"] },
  ],
  Janela: [
    { titulo: "Vão e elétrica", chaves: ["vao_janela", "pe_direito", "ponto_eletrico"] },
    { titulo: "Infraestrutura", chaves: ["metragem_infra"] },
  ],
};
// "Split Hi-Wall" e o estado inicial (tipo ainda não escolhido) caem aqui.
const GRUPOS_TECNICOS_PADRAO: GrupoTecnico[] = [
  { titulo: "Estrutura", chaves: ["tipo_parede", "pe_direito", "ponto_eletrico"] },
  { titulo: "Infraestrutura", chaves: ["unidade_externa", "nivel_condensadora", "tubulacao", "metragem_infra"] },
];

/** Agrupa os campos de `buildSteps()` em telas por tema. Ambiente+aparelho
 *  dividem uma tela; foto e marcação ficam sozinhas — são as únicas telas de
 *  largura cheia, sem outro campo competindo por espaço. */
export function buildStepGroups(tipo: string | null): StepGroup[] {
  const porChave = new Map(buildSteps(tipo).map((s) => [s.key, s]));
  const pega = (chaves: string[]): Step[] =>
    chaves.map((k) => porChave.get(k)).filter((s): s is Step => s !== undefined);
  const tecnicos = (tipo && GRUPOS_TECNICOS[tipo]) || GRUPOS_TECNICOS_PADRAO;

  return [
    { titulo: "Ambiente e aparelho", steps: pega(["ambiente", "produto"]) },
    { titulo: "Foto", steps: pega(["foto"]) },
    { titulo: "Marcação", steps: pega(["marcacao"]) },
    ...tecnicos.map((g) => ({ titulo: g.titulo, steps: pega(g.chaves) })),
  ];
}

/** Um grupo está pronto pra avançar quando todo campo dele tem resposta. Os
 *  tipos "widget" (produto embutido no grupo, foto, marcação) guardam o
 *  próprio sinal de resposta fora de `answers` — por isso recebem
 *  `temFoto`/`marcacaoRespondida` à parte em vez de só olhar o dicionário de
 *  texto (o próprio campo `produto` vira uma chave normal em `answers` assim
 *  que confirmado, então não precisa de flag própria). */
export function grupoRespondido(
  grupo: StepGroup,
  answers: Record<string, string>,
  contexto: { temFoto: boolean; marcacaoRespondida: boolean }
): boolean {
  return grupo.steps.every((s) => {
    if (s.type === "file") return contexto.temFoto;
    if (s.type === "marcacao") return contexto.marcacaoRespondida;
    return Boolean(answers[s.key]?.trim());
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test -- step-groups.test.ts`
Expected: PASS em todos os testes.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros (note que `page.tsx` ainda tem sua própria cópia de `Step`/`buildSteps` —
isso é esperado até a Task 6 remover a duplicata; typecheck deste arquivo isolado passa mesmo
assim porque `step-groups.ts` não é importado por ninguém ainda).

```bash
git add src/app/chatbot/_components/step-groups.ts src/app/chatbot/_components/step-groups.test.ts
git commit -m "feat: agrupa perguntas do questionario por tema (step-groups.ts)"
```

## Task 3: `marcador-instalacao.tsx` — tela cheia, 2 modos, traço livre

**Files:**
- Modify: `src/app/chatbot/_components/marcador-instalacao.tsx` (reescrita completa)

- [ ] **Step 1: Substituir o arquivo inteiro**

```typescript
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Eraser, MapPin, Pencil } from "lucide-react";
import { ConsoleButton } from "@/components/console/console-shell";
import type { CaixaFrac, Marcacao, PontoFrac } from "@/lib/marcacao";
import type { TipoEquipamento } from "./produto-picker";

/**
 * Etapa de marcação, em tela cheia, com dois modos escolhidos por botão (não
 * mais por gesto adivinhado):
 *
 * - "Aparelho": toque posiciona a caixa (tamanho vem do palpite por família,
 *   editável); alças nos 4 cantos redimensionam.
 * - "Tubulação": o dedo desenha um traço livre — todo ponto do gesto vira uma
 *   entrada de `rota`. `parseMarcacao` (lib/marcacao.ts) e o resto do
 *   pipeline (`guide-mask.ts`, `preview-annotations.ts`) já sabem lidar com
 *   um caminho de dezenas de pontos; a única mudança de servidor desta
 *   feature foi parar de cortar `rota` pra 2.
 *
 * Decisões que seguem valendo do desenho anterior: SVG sobre `<img>`
 * (hit-testing de graça), Pointer Events (dedo e mouse pelo mesmo handler),
 * tudo em fração 0-1 (a foto muda de tamanho em cada tela).
 */

const CAIXA_INICIAL: Record<string, CaixaFrac> = {
  Cassete: { x: 0.38, y: 0.2, w: 0.24, h: 0.09 },
  Dutado: { x: 0.38, y: 0.16, w: 0.24, h: 0.06 },
  "Split Hi-Wall": { x: 0.36, y: 0.22, w: 0.28, h: 0.08 },
  "Piso-teto": { x: 0.36, y: 0.62, w: 0.28, h: 0.1 },
  Janela: { x: 0.4, y: 0.38, w: 0.2, h: 0.14 },
};
const CAIXA_PADRAO: CaixaFrac = { x: 0.36, y: 0.24, w: 0.28, h: 0.09 };

/** Piso de tamanho da caixa — abaixo disso um redimensionamento vira um
 *  retângulo pequeno demais pra a imagem-guia desenhar de forma legível
 *  (mesmo piso que `parseMarcacao` aplica no servidor). */
const CAIXA_MIN = { w: 0.05, h: 0.025 };

/** Distância mínima (fração da foto) entre dois pontos consecutivos do traço
 *  livre pra o segundo valer a pena guardar. Sem isto, um arrasto lento em
 *  tela grande gera milhares de pontos quase idênticos antes mesmo de chegar
 *  no teto de sanidade do servidor. */
const DIST_MINIMA_PONTO = 0.004;

type Handle = "nw" | "ne" | "sw" | "se";
type Modo = "aparelho" | "tubulacao";

function caixaCentradaEm(p: PontoFrac, tamanho: CaixaFrac): CaixaFrac {
  const w = tamanho.w;
  const h = tamanho.h;
  return {
    x: Math.min(1 - w, Math.max(0, p.x - w / 2)),
    y: Math.min(1 - h, Math.max(0, p.y - h / 2)),
    w,
    h,
  };
}

function dentroDaCaixa(p: PontoFrac, c: CaixaFrac): boolean {
  return p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
}

/** Redimensiona mantendo o canto OPOSTO ao que está sendo arrastado fixo. */
function redimensionar(origem: CaixaFrac, handle: Handle, p: PontoFrac): CaixaFrac {
  const fixo = {
    x: handle === "ne" || handle === "se" ? origem.x : origem.x + origem.w,
    y: handle === "sw" || handle === "se" ? origem.y : origem.y + origem.h,
  };
  const x = Math.min(fixo.x, p.x);
  const y = Math.min(fixo.y, p.y);
  const w = Math.max(CAIXA_MIN.w, Math.abs(p.x - fixo.x));
  const h = Math.max(CAIXA_MIN.h, Math.abs(p.y - fixo.y));
  return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
}

export function MarcadorInstalacao({
  fotoUrl,
  tipo,
  onConfirm,
  onSkip,
  disabled,
}: {
  fotoUrl: string;
  tipo: TipoEquipamento | null;
  onConfirm: (m: Marcacao) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<Modo>("aparelho");
  const [caixa, setCaixa] = useState<CaixaFrac>(() => (tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
  const [rota, setRota] = useState<PontoFrac[]>([]);
  const gesto = useRef<{ tipo: "mover" | "redimensionar"; handle?: Handle; origemCaixa: CaixaFrac; origemToque: PontoFrac } | null>(null);
  const desenhando = useRef(false);

  const paraFrac = useCallback((clientX: number, clientY: number): PontoFrac => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const iniciarRedimensionar = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      gesto.current = { tipo: "redimensionar", handle, origemCaixa: caixa, origemToque: paraFrac(e.clientX, e.clientY) };
    },
    [caixa, disabled, paraFrac]
  );

  const onPointerDownArea = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const p = paraFrac(e.clientX, e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);

      if (modo === "tubulacao") {
        desenhando.current = true;
        setRota([p]);
        return;
      }

      if (dentroDaCaixa(p, caixa)) {
        gesto.current = { tipo: "mover", origemCaixa: caixa, origemToque: p };
      } else {
        setCaixa(caixaCentradaEm(p, caixa));
      }
    },
    [caixa, disabled, modo, paraFrac]
  );

  const onPointerMoveArea = useCallback(
    (e: React.PointerEvent) => {
      if (modo === "tubulacao") {
        if (!desenhando.current) return;
        const p = paraFrac(e.clientX, e.clientY);
        setRota((atual) => {
          const ultimo = atual[atual.length - 1];
          if (ultimo && Math.hypot(p.x - ultimo.x, p.y - ultimo.y) < DIST_MINIMA_PONTO) return atual;
          return [...atual, p];
        });
        return;
      }
      const g = gesto.current;
      if (!g || g.tipo !== "mover") return;
      const p = paraFrac(e.clientX, e.clientY);
      const dx = p.x - g.origemToque.x;
      const dy = p.y - g.origemToque.y;
      setCaixa({
        ...g.origemCaixa,
        x: Math.min(1 - g.origemCaixa.w, Math.max(0, g.origemCaixa.x + dx)),
        y: Math.min(1 - g.origemCaixa.h, Math.max(0, g.origemCaixa.y + dy)),
      });
    },
    [modo, paraFrac]
  );

  const onPointerMoveHandle = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      if (!g || g.tipo !== "redimensionar" || !g.handle) return;
      const p = paraFrac(e.clientX, e.clientY);
      setCaixa(redimensionar(g.origemCaixa, g.handle, p));
    },
    [paraFrac]
  );

  const onPointerUp = useCallback(() => {
    gesto.current = null;
    desenhando.current = false;
  }, []);

  const limparTraco = useCallback(() => setRota([]), []);
  const recomecarCaixa = useCallback(() => setCaixa((tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO), [tipo]);

  const rotaPath = useMemo(
    () => (rota.length >= 2 ? "M " + rota.map((p) => `${p.x * 100} ${p.y * 100}`).join(" L ") : null),
    [rota]
  );

  const confirmar = useCallback(() => onConfirm({ caixa, rota }), [caixa, rota, onConfirm]);

  const HANDLES: { id: Handle; x: number; y: number }[] = [
    { id: "nw", x: caixa.x, y: caixa.y },
    { id: "ne", x: caixa.x + caixa.w, y: caixa.y },
    { id: "sw", x: caixa.x, y: caixa.y + caixa.h },
    { id: "se", x: caixa.x + caixa.w, y: caixa.y + caixa.h },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex" role="tablist" aria-label="Modo de marcação">
        <button
          role="tab"
          aria-selected={modo === "aparelho"}
          onClick={() => setModo("aparelho")}
          className={`flex-1 py-2.5 text-[12px] font-bold ${modo === "aparelho" ? "bg-blue-500 text-white" : "bg-[var(--bg-inset)] text-[var(--text-muted)]"}`}
        >
          📦 Aparelho
        </button>
        <button
          role="tab"
          aria-selected={modo === "tubulacao"}
          onClick={() => setModo("tubulacao")}
          className={`flex-1 py-2.5 text-[12px] font-bold ${modo === "tubulacao" ? "bg-amber-400 text-black" : "bg-[var(--bg-inset)] text-[var(--text-muted)]"}`}
        >
          <Pencil size={12} className="mr-1 inline" /> Tubulação
        </button>
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        {modo === "aparelho"
          ? "Toque onde o aparelho vai ficar. Arraste pelas alças dos cantos pra ajustar o tamanho."
          : "Desenhe com o dedo o caminho que a tubulação, o dreno e o cabo elétrico vão seguir."}
      </p>

      <div
        ref={areaRef}
        onPointerDown={onPointerDownArea}
        onPointerMove={onPointerMoveArea}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        style={{ cursor: modo === "tubulacao" ? "crosshair" : "default" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl} alt="Foto do ambiente" className="h-full w-full object-contain" draggable={false} />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <rect
            x={caixa.x * 100}
            y={caixa.y * 100}
            width={caixa.w * 100}
            height={caixa.h * 100}
            fill="rgba(78,161,255,0.22)"
            stroke="#4EA1FF"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
          {rotaPath ? (
            <path d={rotaPath} fill="none" stroke="#F5C542" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>

        {modo === "aparelho" &&
          HANDLES.map((h) => (
            <div
              key={h.id}
              onPointerDown={iniciarRedimensionar(h.id)}
              onPointerMove={onPointerMoveHandle}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-blue-500 shadow"
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              aria-label={`Redimensionar pelo canto ${h.id}`}
            />
          ))}
      </div>

      <div className="flex flex-wrap gap-2 p-3">
        {modo === "tubulacao" ? (
          <ConsoleButton icon={Eraser} onClick={limparTraco} disabled={rota.length === 0} className="flex-1 justify-center">
            Desfazer traço
          </ConsoleButton>
        ) : (
          <ConsoleButton icon={MapPin} onClick={recomecarCaixa} className="flex-1 justify-center">
            Recomeçar posição
          </ConsoleButton>
        )}
        <ConsoleButton onClick={onSkip} className="flex-1 justify-center">
          Pular
        </ConsoleButton>
        <ConsoleButton icon={Check} active onClick={confirmar} disabled={disabled} className="flex-1 justify-center">
          Confirmar marcação
        </ConsoleButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. Se o lint reclamar de `<img>`, confirme que o comentário
`eslint-disable-next-line @next/next/no-img-element` está imediatamente acima da tag (igual ao
padrão já usado no resto do arquivo original).

- [ ] **Step 3: Commit**

```bash
git add src/app/chatbot/_components/marcador-instalacao.tsx
git commit -m "feat: marcacao em tela cheia, modo aparelho/tubulacao, traco livre"
```

Verificação funcional real fica pra Task 7 (precisa do wizard novo em `page.tsx` pra chegar
nesta tela).

## Task 4: `group-form.tsx` — renderiza os campos de um grupo

**Files:**
- Create: `src/app/chatbot/_components/group-form.tsx`

- [ ] **Step 1: Criar o arquivo**

```typescript
"use client";

import { useState } from "react";
import { ConsoleButton } from "@/components/console/console-shell";
import { ProdutoPicker } from "./produto-picker";
import { HINTS, type Step, type StepGroup } from "./step-groups";
import type { InventoryProduct } from "@/types/api";

/**
 * Campos de UM grupo de perguntas, todos visíveis na mesma tela. Cobre os 4
 * tipos que aparecem dentro de um grupo multi-campo (`text`, `choice`,
 * `medida`, `produto`) — `file` e `marcacao` nunca entram aqui, são sempre
 * grupos de 1 campo com tela própria (ver `step-groups.ts` e `page.tsx`).
 */
export function GroupForm({
  grupo,
  answers,
  onChangeAnswer,
  onConfirmProduto,
  disabled,
}: {
  grupo: StepGroup;
  answers: Record<string, string>;
  onChangeAnswer: (chave: string, valor: string) => void;
  onConfirmProduto: (produto: InventoryProduct, tipo: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {grupo.steps.map((step) => (
        <div key={step.key}>
          <p className="mb-1.5 text-[12px] font-bold text-[var(--text-primary)]">{step.question}</p>
          {HINTS[step.key] && <p className="mb-2 text-[11px] text-[var(--text-muted)]">{HINTS[step.key]}</p>}
          <CampoStep step={step} valor={answers[step.key] ?? ""} onChange={(v) => onChangeAnswer(step.key, v)} onConfirmProduto={onConfirmProduto} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

function CampoStep({
  step,
  valor,
  onChange,
  onConfirmProduto,
  disabled,
}: {
  step: Step;
  valor: string;
  onChange: (v: string) => void;
  onConfirmProduto: (produto: InventoryProduct, tipo: string) => void;
  disabled?: boolean;
}) {
  if (step.type === "text") {
    return (
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite sua resposta..."
        disabled={disabled}
        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
      />
    );
  }

  if (step.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {step.options.map((opt) => (
          <ConsoleButton key={opt} active={valor === opt} onClick={() => onChange(opt)} disabled={disabled} className="flex-1 justify-center">
            {opt}
          </ConsoleButton>
        ))}
      </div>
    );
  }

  if (step.type === "medida") {
    return <CampoMedida step={step} valor={valor} onChange={onChange} disabled={disabled} />;
  }

  if (step.type === "produto") {
    return <ProdutoPicker onConfirm={onConfirmProduto} disabled={disabled} />;
  }

  return null;
}

function CampoMedida({
  step,
  valor,
  onChange,
  disabled,
}: {
  step: Extract<Step, { type: "medida" }>;
  valor: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // O valor guardado já vem "60 cm" (número + unidade); a caixa de texto
  // mostra só o número, e a unidade é o botão selecionado ao lado.
  const [numeroInicial, unidadeInicial] = valor ? valor.split(" ") : ["", step.unidades[0]];
  const [numero, setNumero] = useState(numeroInicial);
  const [unidade, setUnidade] = useState<"m" | "cm">((unidadeInicial as "m" | "cm") || step.unidades[0]);

  const atualizar = (novoNumero: string, novaUnidade: "m" | "cm") => {
    const limpo = novoNumero.replace(/[^\d.,]/g, "");
    setNumero(limpo);
    onChange(limpo ? `${limpo} ${novaUnidade}` : "");
  };

  return (
    <div className="flex items-center gap-2">
      <input
        inputMode="decimal"
        value={numero}
        onChange={(e) => atualizar(e.target.value, unidade)}
        placeholder="0,00"
        disabled={disabled}
        className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
      />
      <div className="flex gap-1">
        {step.unidades.map((u) => (
          <button
            key={u}
            onClick={() => {
              setUnidade(u);
              if (numero) atualizar(numero, u);
            }}
            disabled={disabled}
            className={`rounded-[8px] border px-3 py-2.5 text-[12px] font-semibold transition ${
              unidade === u ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/chatbot/_components/group-form.tsx
git commit -m "feat: renderiza campos de um grupo de perguntas (group-form.tsx)"
```

## Task 5: `resultado-painel.tsx` — comparação + abas

**Files:**
- Create: `src/app/chatbot/_components/resultado-painel.tsx`

- [ ] **Step 1: Confirmar a dependência do Radix Tabs**

Run: `grep '"@radix-ui/react-tabs"' package.json`
Expected: a linha existe (já é dependência do projeto, primeiro uso é este).

- [ ] **Step 2: Criar o arquivo**

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeftRight, Download, Loader2, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react";
import { ConsoleButton, ConsoleCard } from "@/components/console/console-shell";

export type Posicionamento = { ok: boolean; mensagem: string };
export type Versao = {
  imageUrl: string;
  notes: string | null;
  notesSource: "manual" | "ia" | null;
  posicionamento: Posicionamento | null;
  origem: "geracao" | "ajuste";
};

const CUSTO_APROX_GERACAO = "R$ 0,80";
const TIPOS_CONDENSADORA = [
  ["telhado", "No telhado"],
  ["laje_tecnica", "Laje técnica"],
  ["sacada_tecnica", "Sacada técnica"],
] as const;

const CLASSE_ABA =
  "px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-[var(--text-primary)]";

export function ResultadoPainel({
  generating,
  wallImageUrl,
  versoes,
  versaoAtiva,
  onSelecionarVersao,
  onGerarOutraVersao,
  onDownload,
  downloading,
  revisionPrompt,
  onChangeRevisionPrompt,
  onGerarAjuste,
  condensadoraTipo,
  condensadoraLoading,
  condensadoraImageUrl,
  downloadingCondensadora,
  onGerarCondensadora,
  onDownloadCondensadora,
}: {
  generating: boolean;
  wallImageUrl: string | null;
  versoes: Versao[];
  versaoAtiva: number;
  onSelecionarVersao: (indice: number) => void;
  onGerarOutraVersao: () => void;
  onDownload: () => void;
  downloading: boolean;
  revisionPrompt: string;
  onChangeRevisionPrompt: (v: string) => void;
  onGerarAjuste: () => void;
  condensadoraTipo: "telhado" | "laje_tecnica" | "sacada_tecnica" | null;
  condensadoraLoading: boolean;
  condensadoraImageUrl: string | null;
  downloadingCondensadora: boolean;
  onGerarCondensadora: (tipo: "telhado" | "laje_tecnica" | "sacada_tecnica") => void;
  onDownloadCondensadora: () => void;
}) {
  const versaoAtual = versoes[versaoAtiva] ?? null;
  const generatedImageUrl = versaoAtual?.imageUrl ?? null;
  const compareRef = useRef<HTMLDivElement>(null);
  const [dividerPct, setDividerPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const moverDivisor = useCallback((clientX: number) => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setDividerPct(Math.min(95, Math.max(5, pct)));
  }, []);

  // Clicar em qualquer ponto da faixa já move o divisor — não precisa mais
  // acertar a bolinha pequena pra começar a arrastar (era a queixa: "difícil
  // de arrastar no dedo").
  const onPointerDownFaixa = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      moverDivisor(e.clientX);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [moverDivisor]
  );
  const onPointerMoveFaixa = useCallback((e: React.PointerEvent) => dragging && moverDivisor(e.clientX), [dragging, moverDivisor]);
  const onPointerUpFaixa = useCallback(() => setDragging(false), []);

  if (generating) {
    return (
      <ConsoleCard className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-[12px] font-medium">Gerando visualizacao...</p>
      </ConsoleCard>
    );
  }

  if (!generatedImageUrl || !wallImageUrl) {
    return (
      <ConsoleCard className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--border-strong)] text-center text-[var(--text-muted)]">
        <Sparkles size={22} />
        <p className="max-w-[220px] text-[12px] font-medium">Converse com o assistente pra gerar a visualizacao da instalacao.</p>
      </ConsoleCard>
    );
  }

  return (
    <ConsoleCard>
      <div
        ref={compareRef}
        onPointerDown={onPointerDownFaixa}
        onPointerMove={onPointerMoveFaixa}
        onPointerUp={onPointerUpFaixa}
        onPointerCancel={onPointerUpFaixa}
        className="relative h-[420px] touch-none select-none overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wallImageUrl} alt="Antes" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={generatedImageUrl} alt="Depois" className="h-full w-full object-contain" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 z-10 flex w-0 items-center justify-center" style={{ left: `${dividerPct}%` }}>
          <div className="absolute inset-y-0 w-[2px] bg-blue-400/90" />
          <div className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-blue-500 text-white shadow-lg ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
            <ArrowLeftRight size={14} />
          </div>
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Antes</span>
        <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Depois</span>
      </div>

      {versoes.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Versoes</span>
          {versoes.map((versao, indice) => (
            <button
              key={indice}
              onClick={() => onSelecionarVersao(indice)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                indice === versaoAtiva ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {versao.origem === "ajuste" ? `Ajuste ${indice + 1}` : `V${indice + 1}`}
            </button>
          ))}
        </div>
      )}

      {versaoAtual?.posicionamento && !versaoAtual.posicionamento.ok && (
        <div className="mt-3 flex items-start gap-2 rounded-[8px] border border-amber-500/40 bg-amber-500/10 p-3">
          <ShieldAlert size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-[11px] leading-relaxed text-amber-200">{versaoAtual.posicionamento.mensagem}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <ConsoleButton icon={RefreshCcw} onClick={onGerarOutraVersao}>
            Gerar outra versao
          </ConsoleButton>
          <span className="text-[10px] text-[var(--text-muted)]">
            {versoes.length} {versoes.length === 1 ? "geracao" : "geracoes"} nesta simulacao · ~{CUSTO_APROX_GERACAO} cada
          </span>
        </div>
        <ConsoleButton icon={downloading ? Loader2 : Download} active onClick={onDownload} disabled={downloading}>
          {downloading ? "Baixando..." : "Baixar imagem"}
        </ConsoleButton>
      </div>

      <Tabs.Root defaultValue="ajuste" className="mt-4">
        <Tabs.List className="flex gap-1 border-b border-[var(--border)]">
          <Tabs.Trigger value="ajuste" className={CLASSE_ABA}>
            Ajustar imagem
          </Tabs.Trigger>
          <Tabs.Trigger value="condensadora" className={CLASSE_ABA}>
            Local da condensadora
          </Tabs.Trigger>
          {versaoAtual?.notes && (
            <Tabs.Trigger value="notas" className={CLASSE_ABA}>
              Nota de instalação
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="ajuste" className="space-y-2 pt-3">
          <p className="text-[11px] text-[var(--text-muted)]">Descreva somente o que precisa mudar. A imagem atual será usada como referência.</p>
          <textarea
            value={revisionPrompt}
            onChange={(e) => onChangeRevisionPrompt(e.target.value)}
            maxLength={1200}
            rows={3}
            placeholder="Ex.: suba a condensadora, mantenha a evaporadora cassete no forro e deixe a tubulação aparente pelo lado direito."
            className="w-full resize-y rounded-[6px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-400"
          />
          <div className="flex justify-end">
            <ConsoleButton onClick={onGerarAjuste} disabled={!revisionPrompt.trim() || generating}>
              Gerar ajuste
            </ConsoleButton>
          </div>
        </Tabs.Content>

        <Tabs.Content value="condensadora" className="space-y-2 pt-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Cenário ilustrativo genérico (não é o local real do cliente) com a condensadora real instalada. Cada opção gera uma imagem nova — custo à parte da simulação principal.
          </p>
          <div className="flex flex-wrap gap-2">
            {TIPOS_CONDENSADORA.map(([tipo, rotulo]) => (
              <ConsoleButton key={tipo} active={condensadoraTipo === tipo} disabled={condensadoraLoading} onClick={() => onGerarCondensadora(tipo)}>
                {condensadoraLoading && condensadoraTipo === tipo ? "Gerando..." : rotulo}
              </ConsoleButton>
            ))}
          </div>
          {condensadoraImageUrl && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={condensadoraImageUrl} alt="Opção de local da condensadora" className="w-full rounded-[8px] border border-[var(--border)]" />
              <ConsoleButton icon={downloadingCondensadora ? Loader2 : Download} onClick={onDownloadCondensadora} disabled={downloadingCondensadora} className="w-full justify-center">
                {downloadingCondensadora ? "Baixando..." : "Baixar imagem do local"}
              </ConsoleButton>
            </div>
          )}
        </Tabs.Content>

        {versaoAtual?.notes && (
          <Tabs.Content value="notas" className="pt-3">
            <InstallationNotesCard notes={versaoAtual.notes} source={versaoAtual.notesSource} />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </ConsoleCard>
  );
}

export function InstallationNotesCard({ notes, source }: { notes: string; source: "manual" | "ia" | null }) {
  return (
    <div className="rounded-[10px] border border-amber-500/25 bg-amber-500/8 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber-400" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
          Nota de instalacao {source === "manual" ? "(manual do fabricante)" : "(gerada por IA)"}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{notes}</p>
      {source === "ia" && (
        <p className="mt-2 text-[10px] text-amber-400/80">Orientacao geral gerada por IA — confirme sempre no manual oficial do fabricante antes de instalar.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/chatbot/_components/resultado-painel.tsx
git commit -m "feat: reorganiza tela de resultado em abas (resultado-painel.tsx)"
```

## Task 6: `page.tsx` — orquestração do wizard

**Files:**
- Modify: `src/app/chatbot/page.tsx` (substituição completa do conteúdo)

- [ ] **Step 1: Substituir o arquivo inteiro**

```typescript
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  History,
  ImagePlus,
  Loader2,
  RefreshCcw,
  Sparkles,
  User,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsolePage,
} from "@/components/console/console-shell";
import { AccessGuard } from "@/components/layout/access-guard";
import { createClient } from "@/lib/supabase/client";
import { getImageGenerationHistory, type ImageGeneration } from "@/lib/supabase/queries";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { ProdutoPicker, type TipoEquipamento } from "./_components/produto-picker";
import { MarcadorInstalacao } from "./_components/marcador-instalacao";
import { GroupForm } from "./_components/group-form";
import { ResultadoPainel, InstallationNotesCard, type Versao, type Posicionamento } from "./_components/resultado-painel";
import { buildSteps, buildStepGroups, grupoRespondido, type StepGroup } from "./_components/step-groups";
import { parseMarcacao, type Marcacao } from "@/lib/marcacao";
import type { InventoryProduct } from "@/types/api";

/**
 * Nome de arquivo aceito como chave do Supabase Storage.
 *
 * O nome vinha direto do arquivo escolhido pelo vendedor, e no Brasil ele
 * costuma ter acento, espaco e parenteses ("Foto da sala (1).jpeg",
 * "WhatsApp Image 2026-08-27 as 10.30.11.jpeg"). O Storage recusa a chave e o
 * upload falhava com um toast generico — o vendedor via "erro ao enviar a
 * foto" sem nenhuma pista de que o problema era o nome do proprio arquivo.
 *
 * O uuid na frente ja garante unicidade, entao aqui basta reduzir o resto ao
 * que o Storage aceita, preservando a extensao.
 */
function nomeSeguroDeArquivo(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return limpo.slice(-80) || "foto.jpg";
}

/**
 * Reduz a foto no navegador antes de subir.
 *
 * Dois motivos, os dois com consequencia real:
 *
 * 1. O bucket `chatbot-images` recusa arquivo acima de 10 MB, e foto de celular
 *    moderno passa disso com facilidade.
 * 2. Essa mesma foto viaja em base64 dentro do corpo do webhook do n8n (e de
 *    novo na imagem-guia). Cada MB aqui vira ~1,37 MB de payload, duas vezes.
 *
 * 2000 px no maior lado e mais que suficiente: o Gemini recebe a cena
 * redimensionada de qualquer forma, e a camada tecnica e vetorial.
 */
const LADO_MAXIMO = 2000;

async function comprimirFoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return file;
    if (blob.size >= file.size && escala === 1) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("[chatbot] nao consegui comprimir a foto, subindo original:", err);
    return file;
  }
}

async function downloadImage(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

type ApiMessage = { role: "assistant" | "user"; content: string; imageUrl?: string };
type Tab = "nova" | "historico";

/** O que a tela precisa para reabrir — e retomar — uma geração antiga. */
type ItemPreview = {
  wallImageUrl: string | null;
  generatedImageUrl: string;
  installationNotes: string | null;
  installationNotesSource: "manual" | "ia" | null;
  answers: Record<string, unknown> | null;
};

/** Chaves fixas dos 2 primeiros grupos (Ambiente e aparelho): sobrevivem a
 *  uma troca de tipo de equipamento porque não dependem de qual ramo é. Toda
 *  outra chave é "técnica" — pertence a algum ramo específico e precisa ser
 *  descartada se o vendedor voltar e trocar o aparelho por um de tipo
 *  diferente (senão um valor como "tubulacao" fica pendurado pra uma Janela,
 *  que não pergunta isso, e contamina o que vai pro n8n). */
const CHAVES_FIXAS = new Set(["ambiente", "produto", "codigo_erp", "sku", "marca", "modelo", "tipo_equipamento", "foto", "marcacao"]);

export default function ChatbotPage() {
  return (
    <AccessGuard perm="manage_gerador_imagem">
      <ChatbotPageInner />
    </AccessGuard>
  );
}

function ChatbotPageInner() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("nova");
  const [grupoIndex, setGrupoIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [wallImageUrl, setWallImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoAtiva, setVersaoAtiva] = useState(0);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [marcacao, setMarcacao] = useState<Marcacao | null>(null);
  const [condensadoraTipo, setCondensadoraTipo] = useState<"telhado" | "laje_tecnica" | "sacada_tecnica" | null>(null);
  const [condensadoraLoading, setCondensadoraLoading] = useState(false);
  const [condensadoraImageUrl, setCondensadoraImageUrl] = useState<string | null>(null);
  const [downloadingCondensadora, setDownloadingCondensadora] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [previewItem, setPreviewItem] = useState<ItemPreview | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [historyItems, setHistoryItems] = useState<ImageGeneration[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryItems(await getImageGenerationHistory());
      setHistoryLoaded(true);
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Erro ao carregar dados";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "historico" && !historyLoaded) void fetchHistory();
  }, [tab, historyLoaded, fetchHistory]);

  const grupos = useMemo(() => buildStepGroups(answers.tipo_equipamento ?? null), [answers.tipo_equipamento]);
  const grupoAtual: StepGroup | undefined = grupos[grupoIndex];
  const questionarioConcluido = grupoIndex >= grupos.length;
  const isFoto = grupoAtual?.titulo === "Foto";
  const isMarcacao = grupoAtual?.titulo === "Marcação";
  const isTelaCheia = isFoto || isMarcacao;

  // Reseta o rascunho toda vez que muda de grupo — populado a partir de
  // `answers` pra reabrir com os valores certos quando o vendedor aperta
  // "Voltar" e reedita. Depende só de `grupoIndex` de propósito: só interessa
  // o instante em que o grupo troca, não cada vez que `answers` muda por
  // outro motivo (isso re-rodaria o reset e apagaria o que acabou de digitar).
  useEffect(() => {
    if (!grupoAtual || isTelaCheia) return;
    const inicial: Record<string, string> = {};
    for (const s of grupoAtual.steps) inicial[s.key] = answers[s.key] ?? "";
    setRascunho(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoIndex]);

  const buildAnswersForApi = useCallback(
    (finalAnswers: Record<string, string>): ApiMessage[] => {
      const messages: ApiMessage[] = [];
      for (const s of buildSteps(finalAnswers.tipo_equipamento ?? null)) {
        messages.push({ role: "assistant", content: s.question });
        if (s.type === "file") {
          messages.push({ role: "user", content: "Foto enviada.", imageUrl: wallImageUrl ?? undefined });
        } else if (s.type === "marcacao") {
          messages.push({ role: "user", content: finalAnswers.marcacao ?? "Marcacao pulada." });
        } else {
          messages.push({ role: "user", content: finalAnswers[s.key] ?? "" });
        }
      }
      return messages;
    },
    [wallImageUrl]
  );

  const requestGeneration = useCallback(
    async (finalAnswers: Record<string, string>, revision?: { referenceImageUrl?: string; revisionPrompt?: string }) => {
      setGenerating(true);
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: buildAnswersForApi(finalAnswers),
            imageUrl: wallImageUrl,
            answers: finalAnswers,
            referenceImageUrl: revision?.referenceImageUrl,
            revisionPrompt: revision?.revisionPrompt,
            marcacao,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Não foi possível gerar a imagem.", "error");
          return;
        }
        setVersoes((atuais) => {
          const proximas = [
            ...atuais,
            {
              imageUrl: data.imageUrl as string,
              notes: (data.installationNotes as string | null) ?? null,
              notesSource: (data.installationNotesSource as "manual" | "ia" | null) ?? null,
              posicionamento: (data.posicionamento as Posicionamento | null) ?? null,
              origem: revision?.revisionPrompt ? ("ajuste" as const) : ("geracao" as const),
            },
          ];
          setVersaoAtiva(proximas.length - 1);
          return proximas;
        });
        setRevisionPrompt("");
        setHistoryLoaded(false);
      } catch {
        toast("Erro de conexao ao gerar a imagem.", "error");
      } finally {
        setGenerating(false);
      }
    },
    [buildAnswersForApi, wallImageUrl, marcacao, toast]
  );

  // Dispara a geração automaticamente assim que o último grupo é confirmado —
  // só na primeira vez (`versoes.length === 0`); repetir a geração depois é
  // uma ação explícita do botão "Gerar outra versao". Depende só de
  // `questionarioConcluido` de propósito, mesmo motivo do reset de rascunho
  // acima: sem isto reexecutaria a cada render que também mexe em `answers`.
  useEffect(() => {
    if (questionarioConcluido && versoes.length === 0 && !generating) {
      void requestGeneration(answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionarioConcluido]);

  const requestRevision = useCallback(() => {
    const atual = versoes[versaoAtiva]?.imageUrl;
    if (!atual || !revisionPrompt.trim() || generating) return;
    void requestGeneration(answers, { referenceImageUrl: atual, revisionPrompt: revisionPrompt.trim() });
  }, [answers, versoes, versaoAtiva, generating, requestGeneration, revisionPrompt]);

  const gerarCondensadora = useCallback(
    async (tipo: "telhado" | "laje_tecnica" | "sacada_tecnica") => {
      setCondensadoraTipo(tipo);
      setCondensadoraLoading(true);
      setCondensadoraImageUrl(null);
      try {
        const res = await fetch("/api/generate-image/condensadora-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipoLocal: tipo, productImageUrl, distanciaTexto: answers.unidade_externa || null }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Não foi possível gerar a opção de local.", "error");
          return;
        }
        setCondensadoraImageUrl(data.imageUrl);
      } catch {
        toast("Erro de conexao ao gerar a opção de local.", "error");
      } finally {
        setCondensadoraLoading(false);
      }
    },
    [productImageUrl, answers.unidade_externa, toast]
  );

  const handleDownloadCondensadora = useCallback(async () => {
    if (!condensadoraImageUrl) return;
    setDownloadingCondensadora(true);
    try {
      await downloadImage(condensadoraImageUrl, `local-condensadora-${condensadoraTipo ?? "opcao"}-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloadingCondensadora(false);
    }
  }, [condensadoraImageUrl, condensadoraTipo, toast]);

  const handleDownload = useCallback(async () => {
    const url = versoes[versaoAtiva]?.imageUrl;
    if (!url) return;
    setDownloading(true);
    try {
      await downloadImage(url, `simulacao-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloading(false);
    }
  }, [versoes, versaoAtiva, toast]);

  const handleSubmitGroup = useCallback((patch: Record<string, string>) => {
    setAnswers((atual) => {
      const tipoMudou = Boolean(patch.tipo_equipamento) && Boolean(atual.tipo_equipamento) && patch.tipo_equipamento !== atual.tipo_equipamento;
      if (!tipoMudou) return { ...atual, ...patch };
      const preservado = Object.fromEntries(Object.entries(atual).filter(([k]) => CHAVES_FIXAS.has(k)));
      return { ...preservado, ...patch };
    });
    setGrupoIndex((i) => i + 1);
  }, []);

  const handleVoltar = useCallback(() => setGrupoIndex((i) => Math.max(0, i - 1)), []);

  const handleRascunhoProduto = useCallback((produto: InventoryProduct, tipo: string) => {
    setProductImageUrl(produto.imageUrl ?? null);
    setRascunho((r) => ({
      ...r,
      produto: `${produto.name} (${produto.sku ?? produto.erpCode})`,
      codigo_erp: produto.erpCode ?? "",
      sku: produto.sku ?? "",
      marca: produto.brand ?? "",
      modelo: produto.name ?? "",
      tipo_equipamento: tipo,
    }));
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const arquivo = await comprimirFoto(file);
        const path = `${crypto.randomUUID()}-${nomeSeguroDeArquivo(arquivo.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("chatbot-images")
          .upload(path, arquivo, { contentType: arquivo.type || "image/jpeg" });
        if (uploadError) {
          console.error("[chatbot] upload da foto falhou:", uploadError);
          toast(`Erro ao enviar a foto: ${uploadError.message}`, "error");
          return;
        }
        const { data } = supabase.storage.from("chatbot-images").getPublicUrl(path);
        setWallImageUrl(data.publicUrl);
      } finally {
        setUploading(false);
      }
    },
    [toast]
  );

  const handleConfirmarMarcacao = useCallback(
    (m: Marcacao) => {
      setMarcacao(m);
      setAnswers((a) => ({
        ...a,
        marcacao: "Aparelho marcado na foto" + (m.rota.length >= 2 ? ", tubulação desenhada." : "."),
      }));
      setGrupoIndex((i) => i + 1);
    },
    []
  );

  const handlePularMarcacao = useCallback(() => {
    setMarcacao(null);
    setAnswers((a) => ({ ...a, marcacao: "Marcacao pulada." }));
    setGrupoIndex((i) => i + 1);
  }, []);

  const retomarDoHistorico = useCallback((item: ItemPreview) => {
    const respostas = (item.answers ?? {}) as Record<string, unknown>;
    const texto: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(respostas)) {
      if (typeof valor === "string") texto[chave] = valor;
      else if (typeof valor === "boolean") texto[chave] = valor ? "Sim" : "Não";
    }
    const marcacaoSalva = parseMarcacao(respostas.marcacao);

    setAnswers(texto);
    setMarcacao(marcacaoSalva);
    setWallImageUrl(item.wallImageUrl);
    setVersoes([
      {
        imageUrl: item.generatedImageUrl,
        notes: item.installationNotes,
        notesSource: item.installationNotesSource,
        posicionamento: null,
        origem: "geracao",
      },
    ]);
    setVersaoAtiva(0);
    setGrupoIndex(buildStepGroups(texto.tipo_equipamento ?? null).length);
    setPreviewItem(null);
    setTab("nova");
  }, []);

  const handleRestart = useCallback(() => {
    setGrupoIndex(0);
    setAnswers({});
    setRascunho({});
    setWallImageUrl(null);
    setMarcacao(null);
    setVersoes([]);
    setVersaoAtiva(0);
  }, []);

  return (
    <ConsolePage title="Gerador de Imagem" subtitle="Simulação de instalação com IA">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções do gerador de imagem">
        <ConsoleButton icon={Sparkles} active={tab === "nova"} onClick={() => setTab("nova")} role="tab" aria-selected={tab === "nova"}>
          Nova simulacao
        </ConsoleButton>
        <ConsoleButton icon={History} active={tab === "historico"} onClick={() => setTab("historico")} role="tab" aria-selected={tab === "historico"}>
          Histórico
          {historyItems.length > 0 && <span className="font-data opacity-80">{historyItems.length}</span>}
        </ConsoleButton>
      </div>

      {tab === "nova" ? (
        questionarioConcluido ? (
          <div className="space-y-3">
            {versoes.length > 0 && (
              <div className="flex justify-end">
                <ConsoleButton icon={RefreshCcw} onClick={handleRestart}>
                  Começar nova simulação
                </ConsoleButton>
              </div>
            )}
            <ResultadoPainel
              generating={generating}
              wallImageUrl={wallImageUrl}
              versoes={versoes}
              versaoAtiva={versaoAtiva}
              onSelecionarVersao={setVersaoAtiva}
              onGerarOutraVersao={() => requestGeneration(answers)}
              onDownload={handleDownload}
              downloading={downloading}
              revisionPrompt={revisionPrompt}
              onChangeRevisionPrompt={setRevisionPrompt}
              onGerarAjuste={requestRevision}
              condensadoraTipo={condensadoraTipo}
              condensadoraLoading={condensadoraLoading}
              condensadoraImageUrl={condensadoraImageUrl}
              downloadingCondensadora={downloadingCondensadora}
              onGerarCondensadora={gerarCondensadora}
              onDownloadCondensadora={handleDownloadCondensadora}
            />
          </div>
        ) : grupoAtual ? (
          <ConsoleCard pad={false} className="flex min-h-[min(680px,80dvh)] flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                {grupoIndex > 0 && (
                  <button
                    onClick={handleVoltar}
                    aria-label="Voltar"
                    className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">{grupoAtual.titulo}</h2>
              </div>
              <span className="font-data text-[11px] text-[var(--text-muted)]">
                {grupoIndex + 1}/{grupos.length}
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden bg-[var(--bg-subtle)]">
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${(grupoIndex / grupos.length) * 100}%` }} />
            </div>

            <div className={isTelaCheia ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto p-4"}>
              {isFoto ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  <ConsoleButton
                    icon={uploading ? Loader2 : ImagePlus}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    active
                    className="w-full max-w-xs justify-center"
                  >
                    {uploading ? "Enviando..." : wallImageUrl ? "Trocar foto" : "Selecionar foto"}
                  </ConsoleButton>
                  {wallImageUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={wallImageUrl} alt="Foto enviada" className="max-h-[320px] rounded-[8px] border border-[var(--border)] object-contain" />
                      <ConsoleButton icon={Check} active onClick={() => setGrupoIndex((i) => i + 1)} className="w-full max-w-xs justify-center">
                        Continuar
                      </ConsoleButton>
                    </>
                  )}
                </div>
              ) : isMarcacao ? (
                wallImageUrl ? (
                  <MarcadorInstalacao
                    fotoUrl={wallImageUrl}
                    tipo={(answers.tipo_equipamento as TipoEquipamento | undefined) ?? null}
                    onConfirm={handleConfirmarMarcacao}
                    onSkip={handlePularMarcacao}
                    disabled={generating}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <ConsoleButton onClick={handlePularMarcacao} className="w-full max-w-xs justify-center">
                      Continuar sem marcacao
                    </ConsoleButton>
                  </div>
                )
              ) : (
                <GroupForm
                  grupo={grupoAtual}
                  answers={rascunho}
                  onChangeAnswer={(chave, valor) => setRascunho((r) => ({ ...r, [chave]: valor }))}
                  onConfirmProduto={handleRascunhoProduto}
                  disabled={generating}
                />
              )}
            </div>

            {!isTelaCheia && (
              <div className="flex justify-end border-t border-[var(--border)] p-3">
                <ConsoleButton
                  active
                  disabled={!grupoRespondido(grupoAtual, rascunho, { temFoto: true, marcacaoRespondida: true })}
                  onClick={() => handleSubmitGroup(rascunho)}
                >
                  Continuar
                </ConsoleButton>
              </div>
            )}
          </ConsoleCard>
        ) : null
      ) : (
        <HistóricoTab loading={historyLoading} error={historyError} items={historyItems} onSelect={setPreviewItem} />
      )}

      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} onContinuar={retomarDoHistorico} />}
    </ConsolePage>
  );
}

function HistóricoTab({
  loading,
  error,
  items,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  items: ImageGeneration[];
  onSelect: (item: ItemPreview) => void;
}) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;
  if (!items.length) {
    return (
      <ConsoleCard className="flex h-40 flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
        <Clock size={20} />
        <p className="text-[12px] font-medium">Nenhuma simulacao gerada ainda.</p>
      </ConsoleCard>
    );
  }

  async function handleCardDownload(e: React.MouseEvent, item: ImageGeneration) {
    e.stopPropagation();
    setDownloadingId(item.id);
    try {
      await downloadImage(item.generated_image_url, `simulacao-${item.id}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() =>
            onSelect({
              wallImageUrl: item.wall_image_url,
              generatedImageUrl: item.generated_image_url,
              installationNotes: item.installation_notes,
              installationNotesSource: item.installation_notes_source,
              answers: item.answers,
            })
          }
          className="text-left"
        >
          <ConsoleCard pad={false} className="overflow-hidden transition-colors hover:border-blue-500/50">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generated_image_url} alt="Simulação gerada" className="h-36 w-full object-cover" />
              <button
                onClick={(e) => handleCardDownload(e, item)}
                disabled={downloadingId === item.id}
                aria-label="Baixar imagem"
                title="Baixar imagem"
                className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-[6px] bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-60"
              >
                {downloadingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-500/10 text-[9px] font-bold text-blue-300">
                  <User size={11} />
                </div>
                <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{item.user_name ?? "Desconhecido"}</p>
              </div>
              <p className="mt-1.5 font-data text-[11px] text-[var(--text-muted)]">{formatDateTime(item.created_at)}</p>
            </div>
          </ConsoleCard>
        </button>
      ))}
    </div>
  );
}

function PreviewModal({
  item,
  onClose,
  onContinuar,
}: {
  item: ItemPreview;
  onClose: () => void;
  onContinuar: (item: ItemPreview) => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadImage(item.generatedImageUrl, `simulacao-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] focus:outline-none">
          <Dialog.Title className="sr-only">Pré-visualização da simulação</Dialog.Title>
          <div className={`grid grid-cols-1 ${item.wallImageUrl ? "sm:grid-cols-2" : ""}`}>
            {item.wallImageUrl && (
              <div>
                <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Antes</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.wallImageUrl} alt="Antes" className="h-[260px] w-full object-contain p-3 pt-1 sm:h-[420px]" />
              </div>
            )}
            <div>
              <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Depois</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generatedImageUrl} alt="Depois" className="h-[260px] w-full object-contain p-3 pt-1 sm:h-[420px]" />
            </div>
          </div>
          {item.installationNotes && (
            <div className="px-3 pb-3">
              <InstallationNotesCard notes={item.installationNotes} source={item.installationNotesSource} />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-3">
            <ConsoleButton icon={RefreshCcw} onClick={() => onContinuar(item)}>
              Retomar e ajustar
            </ConsoleButton>
            <ConsoleButton icon={downloading ? Loader2 : Download} active onClick={handleDownload} disabled={downloading}>
              {downloading ? "Baixando..." : "Baixar imagem"}
            </ConsoleButton>
            <Dialog.Close asChild>
              <ConsoleButton>Fechar</ConsoleButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros. Se aparecer erro de tipo em `grupoAtual` possivelmente `undefined` sendo
usado sem checagem, confirme que todo acesso está atrás do `grupoAtual ? ... : null` do JSX
acima (o `grupoAtual` só é `undefined` quando `questionarioConcluido` já é `true`, e esse ramo
não usa `grupoAtual`).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros — preste atenção em imports não usados (o arquivo antigo importava
`MessageSquare`, `ArrowLeftRight`, `ShieldAlert` etc. que saíram pra `resultado-painel.tsx`; a
lista de imports acima já reflete só o que `page.tsx` usa agora).

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm run test`
Expected: PASS (inclui os testes novos de `marcacao.test.ts` e `step-groups.test.ts`, mais
todo o resto do projeto que não foi tocado).

- [ ] **Step 5: Commit**

```bash
git add src/app/chatbot/page.tsx
git commit -m "feat: page.tsx orquestra wizard de grupos em vez de chat de bolhas"
```

## Task 7: Verificação manual no navegador

**Files:** nenhum (só verificação — sem código novo).

- [ ] **Step 1: Subir o dev server**

Run: `npm run dev`
Expected: compila sem erro, serve em `http://localhost:3000`.

- [ ] **Step 2: Login e navegação até /chatbot**

Abra `http://localhost:3000/chatbot` logado com um usuário que tenha a permissão
`manage_gerador_imagem` (ver `AGENTS.md`: `lukeottoboni@gmail.com` é superadmin).
Expected: aba "Nova simulacao" mostra o grupo "Ambiente e aparelho" (campo de texto + busca de
produto), sem bolha de chat, sem "digitando...".

- [ ] **Step 3: Ramo Split Hi-Wall, caminho feliz completo**

1. Preencha "ambiente", busque e confirme um produto Hi-Wall (ex: qualquer split sem
   "CASSETE"/"DUTADO"/"JANELA"/"TETO" no nome).
2. Clique "Continuar" → tela "Foto": envie uma imagem, clique "Continuar".
3. Tela "Marcação": alterne entre "📦 Aparelho" (toque reposiciona a caixa, arraste uma alça de
   canto redimensiona) e "✏️ Tubulação" (desenhe um traço livre com o mouse/dedo — deve
   aparecer uma linha amarela contínua seguindo o cursor, não uma reta única). Clique
   "Confirmar marcação".
4. Tela "Estrutura": responda tipo de parede, pé-direito (confira o hint aparece abaixo da
   pergunta), ponto elétrico. Clique "Continuar".
5. Tela "Infraestrutura": responda os 4 campos. Clique "Continuar".

Expected: geração dispara automaticamente, mostra spinner "Gerando visualizacao...", e ao
terminar mostra o painel de resultado com o slider antes/depois.

- [ ] **Step 4: Slider e abas do resultado**

No painel de resultado: clique em qualquer ponto da faixa de comparação (não só na bolinha) —
o divisor deve pular pra lá imediatamente. Alterne entre as abas "Ajustar imagem" e "Local da
condensadora" — só uma fica visível por vez.

- [ ] **Step 5: Botão Voltar entre grupos**

Comece uma nova simulação (ou use "Começar nova simulação"), avance até "Infraestrutura", e
clique na seta de voltar no cabeçalho repetidamente até chegar em "Ambiente e aparelho".
Expected: cada grupo reabre com os valores que você já tinha respondido preenchidos (não
volta em branco).

- [ ] **Step 6: Segundo ramo — Cassete, com traço de tubulação livre real**

Repita o fluxo escolhendo um produto Cassete. Expected: telas "Forro" (4 campos: tipo de
forro, pé-direito/plenum, alçapão, ponto elétrico) e depois "Infraestrutura" — confirme que
NÃO aparece a pergunta de "tipo de parede" (é só do ramo Hi-Wall). Na marcação, desenhe um
traço de tubulação com várias curvas (não uma linha reta) e confirme — a prévia final deve
mostrar a "LIGAÇÃO ATÉ CONDENSADORA" ancorada no fim do traço que você desenhou, não numa
direção genérica.

- [ ] **Step 7: Troca de tipo de equipamento via Voltar (edge case)**

Comece um ramo Hi-Wall, avance até responder "tipo_parede" ou "tubulacao" em "Estrutura" ou
"Infraestrutura", depois clique voltar até "Ambiente e aparelho" e troque o produto por um
Cassete. Continue o fluxo. Expected: as telas seguintes mostram os campos de Cassete
("Forro"), não sobra nenhuma resposta antiga do ramo Hi-Wall interferindo (isto exercita o
`CHAVES_FIXAS`/limpeza de `handleSubmitGroup` no Task 6).

- [ ] **Step 8: Histórico continua funcionando**

Abra a aba "Histórico", clique num item, confirme que o modal abre com antes/depois, e clique
"Retomar e ajustar" — deve cair direto no painel de resultado (questionário já concluído),
pronto pra pedir um ajuste.

- [ ] **Step 9: Reportar resultado**

Depois de rodar os passos acima, reporte pro usuário o que funcionou e qualquer coisa que
precisar de ajuste fino antes de considerar a feature pronta (ex.: tamanho de alça no celular
real, sensibilidade do traço livre em tela pequena — só dá pra validar de verdade num
dispositivo físico, não só no emulador de mobile do DevTools).

## Verificação final

- [ ] `npm run typecheck` limpo
- [ ] `npm run lint` limpo
- [ ] `npm run test` passando (inclui os testes novos desta feature)
- [ ] Passos 3-8 da Task 7 confirmados manualmente no navegador
