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
 * "Desenho Técnico" — linha de chamada ortogonal usada quando `modoInfra` é
 * `gemini_3d` e o próprio Gemini desenha os callouts na cena, ou pelo modo
 * `vetorial` de fallback. Branco/quase-branco só, sem cor de marca na linha —
 * mesma técnica validada no antigo layout comercial do cassete
 * (`chamadaOrtogonal`), generalizada aqui.
 */
export const TRACO_ORTOGONAL = "rgba(255,255,255,0.85)";
export const TRACO_ORTOGONAL_PONTO = "#FFFFFF";

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

/** Medidas da prancha (foto + faixa lateral). Ficam aqui, e não no compositor,
 *  porque a tela também precisa delas: o comparador antes/depois sobrepõe a
 *  foto original só na parte da prancha que é foto. */
export const PRANCHA = { altura: 1600, larguraFaixa: 600 } as const;
