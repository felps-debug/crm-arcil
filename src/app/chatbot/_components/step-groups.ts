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
