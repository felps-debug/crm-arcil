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

import { LOCAIS_CONDENSADORA } from "@/lib/alertas-instalacao";

export type Step =
  | { key: string; question: string; type: "text" }
  | { key: string; question: string; type: "file" }
  | { key: string; question: string; type: "produto" }
  | { key: string; question: string; type: "marcacao" }
  | { key: string; question: string; type: "medida"; unidades: ("m" | "cm")[] }
  | { key: string; question: string; type: "choice"; options: string[] };

export type StepGroup = { titulo: string; steps: Step[] };

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
 * As perguntas de parede (tipo de parede, ponto elétrico "na parede",
 * tubulação "embutida na parede") só fazem sentido pro hi-wall. Um cassete
 * mora no forro, um dutado tem espaço técnico em vez de pé-direito de
 * parede, e uma janela é peça única sem condensadora separada.
 *
 * `produto` vem cedo (logo depois de `ambiente`) porque é dali que o tipo sai.
 *
 * A ordem de cada ramo é a ordem dos grupos em `buildStepGroups` (o teste
 * compara as duas listas na mesma ordem). Nenhuma pergunta é texto livre que
 * vá para a prévia: texto livre já levou "Distância aproximada: Sacada" e
 * "NAO SEI DIZER" para a imagem do cliente.
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

  // "Split Hi-Wall" e o estado inicial (tipo ainda não escolhido, antes do
  // passo "produto" responder) caem aqui.
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

/** Uma linha de explicação por campo técnico — a queixa original era pergunta
 *  técnica sem contexto ("ponto elétrico no forro", "plenum") largada
 *  sozinha. */
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

const ELETRICA: GrupoTecnico = { titulo: "Elétrica e dreno", chaves: ["ponto_eletrico", "tensao", "dreno"] };

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
// "Split Hi-Wall" e o estado inicial (tipo ainda não escolhido) caem aqui.
const GRUPOS_TECNICOS_PADRAO: GrupoTecnico[] = [
  { titulo: "Estrutura", chaves: ["tipo_parede", "pe_direito", "obstaculos"] },
  ELETRICA,
  { titulo: "Condensadora e tubulação", chaves: ["local_condensadora", "distancia_condensadora", "nivel_condensadora", "tubulacao"] },
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
