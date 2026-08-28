/**
 * Padrão visual único da prévia técnica ARCIL.
 *
 * Por que existir: até aqui `installation-overlay.ts`, `install-schematic.ts` e
 * `cutaway-diagram.ts` cada um declarava sua própria paleta (as MESMAS três
 * constantes AZUL/CLARO/CINZA, copiadas), seu próprio raio de card e sua
 * própria sombra de texto. Enquanto os três desenhavam partes diferentes da
 * imagem, "parecido" bastava. Agora que os três desenham na MESMA faixa da
 * cena (callout ancorado, rota, cards de canto), qualquer divergência lê como
 * três ferramentas diferentes coladas na mesma foto — não como um gerador
 * oficial. Uma fonte só de verdade resolve isso e é o que permite mexer no
 * visual inteiro num lugar.
 *
 * Nada aqui depende de runtime: são tokens puros, importáveis do cliente e do
 * servidor.
 */

/** Azul institucional — títulos de callout, ícones, cota de destaque. */
export const AZUL = "#4EA1FF";
/** Texto sobre a cena. Branco puro "queima" em parede clara; este cinza-claro
 *  mantém contraste sem estourar. */
export const CLARO = "#F2F6FC";
/** Texto secundário (rodapé legal, subtítulo de card). */
export const CINZA = "#A9B8CE";
/** Fundo dos cards de canto — escuro translúcido, deixa a cena aparecer. */
export const CARD_FUNDO = "rgba(12,18,28,0.72)";
export const CARD_BORDA = "rgba(255,255,255,0.22)";
export const CARD_RAIO = 14;

/**
 * Cores da infraestrutura. São as mesmas quatro da referência que o Paulo
 * aprovou, e o MESMO array alimenta a legenda desenhada no canto e o feixe de
 * linhas desenhado na cena — se as duas listas fossem separadas, uma mudança
 * de cor sairia com a legenda mentindo sobre a linha.
 */
export const INFRA = {
  liquido: { cor: "#FF6B6B", rotulo: "Tubulação de cobre (ida)" },
  gas: { cor: "#F5C542", rotulo: "Tubulação de cobre (retorno)" },
  eletrico: { cor: "#4EA1FF", rotulo: "Cabo elétrico" },
  dreno: { cor: "#5FD98A", rotulo: "Dreno c/ inclinação", tracejado: true },
} as const;

export type ChaveInfra = keyof typeof INFRA;
export const ORDEM_INFRA: ChaveInfra[] = ["liquido", "gas", "eletrico", "dreno"];

/** Sombra usada em TODO texto desenhado direto sobre a foto. Sem ela, um
 *  callout claro sobre parede clara some — e a foto do ambiente é do cliente,
 *  não dá pra assumir fundo escuro. */
export const SOMBRA_TEXTO = "0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)";
export const SOMBRA_TITULO = "0 2px 6px rgba(0,0,0,0.85)";

/**
 * Faixas da imagem onde a moldura institucional (logo, selo, cards de canto,
 * QR) é desenhada. Os callouts ancorados precisam saber disso para não cair
 * embaixo — os módulos que desenham cada parte não se enxergam em tempo de
 * execução, então a divisão fica declarada aqui, medida contra o render real
 * em 1536px.
 */
export const FAIXA = {
  /** Acima disso é área de respiro/legenda — nenhum callout ancorado desce daí pra cima. */
  topoFrac: 0.035,
  /** Abaixo disso ficam selo, card de lembretes, logo e QR. */
  baseFrac: 0.78,
  /** Margem lateral padrão, em fração da largura. */
  margemFrac: 0.028,
} as const;

/** Texto legal fixo do rodapé — mesma frase em toda prévia, em um lugar só. */
export const RODAPE_LEGAL =
  "Prévia para visualização. A instalação final deve ser validada no local por profissional habilitado, conforme o manual do fabricante e as normas ABNT NBR 16401 e NBR 16655.";

export const SELO_APROVACAO = {
  titulo: "POSICIONAMENTO ILUSTRATIVO PARA APROVAÇÃO",
  corpo: "Instalação conforme orientação do fabricante.",
} as const;

// ---------------------------------------------------------------------------
// V2 — Commercial Technical
//
// Tokens do layout novo. Ficam ao lado dos antigos, não no lugar deles: a V1
// continua servindo todo tipo de equipamento enquanto a V2 é validada só no
// cassete. Quando as duas convergirem, a V1 sai.
//
// A direção visual da V2 é o oposto da V1 em um ponto específico: nada de card
// escuro pesado e borda dura. O overlay é vidro translúcido sobre a fotografia,
// e a cor só aparece em elemento técnico (as quatro linhas de infraestrutura).
// ---------------------------------------------------------------------------

/** Vidro claro sobre a cena. Substitui o `CARD_FUNDO` quase opaco da V1. */
export const V2_VIDRO = "rgba(10,16,26,0.58)";
export const V2_VIDRO_BORDA = "rgba(255,255,255,0.14)";
export const V2_RAIO = 10;

/** Texto sobre a fotografia. Branco puro só no que precisa de destaque. */
export const V2_TEXTO = "#FFFFFF";
export const V2_TEXTO_SUAVE = "rgba(255,255,255,0.82)";
export const V2_TEXTO_FRACO = "rgba(255,255,255,0.60)";

/** Traço de callout e de cota: fino, branco, discreto. */
export const V2_TRACO = "rgba(255,255,255,0.55)";
export const V2_TRACO_FORTE = "rgba(255,255,255,0.80)";

/**
 * Escala tipográfica relativa ao lado menor do canvas.
 *
 * A V1 usava pixel fixo, o que fazia o texto encolher numa cena 2K e engordar
 * numa 1K. Aqui cada tamanho é uma fração, e o compositor multiplica pelo lado
 * menor — o mesmo layout serve landscape e portrait.
 */
export const V2_TIPO = {
  rotulo: 0.0155,      // LABEL uppercase semibold
  texto: 0.0132,       // corpo
  medida: 0.0150,      // cota
  tituloCard: 0.0132,
  textoCard: 0.0122,
  micro: 0.0104,
} as const;

/**
 * Zonas do template landscape do cassete, em fração do quadro.
 *
 * A V2 não deixa o compositor escolher posição desde o início: cada elemento
 * tem sua zona preferencial e só cai no posicionamento dinâmico se ela estiver
 * ocupada. Foi assim que a referência aprovada foi desenhada, e é o que mantém
 * duas prévias diferentes com a mesma cara.
 */
export const V2_ZONAS_CASSETE = {
  evaporadora: { x: 0.028, y: 0.045, w: 0.155 },
  forroLaje: { x: 0.200, y: 0.045, w: 0.130 },
  // A legenda vive na faixa superior direita, longe do eixo do aparelho — que
  // fica no centro e leva junto o raio-X e o leque de ar.
  infraestrutura: { x: 0.665, y: 0.045, w: 0.235 },
  areaExterna: { x: 0.835, y: 0.225, w: 0.155 },
  modelo: { x: 0.028, y: 0.235, w: 0.215 },
  fluxo: { x: 0.40, y: 0.585, w: 0.20 },
  ligacao: { x: 0.60, y: 0.335, w: 0.19 },
  checklist: { x: 0.695, y: 0.665, w: 0.285 },
  aprovacao: { x: 0.028, y: 0.775, w: 0.245 },
  logo: { x: 0.028, y: 0.875 },
  qr: { x: 0.875, y: 0.875 },
} as const;

/** Comprimento máximo de linha de chamada, em fração da diagonal. Acima disso
 *  a linha atravessa o ambiente e passa a competir com a fotografia. */
export const V2_CHAMADA_MAX_DIAGONAL = 0.24;
