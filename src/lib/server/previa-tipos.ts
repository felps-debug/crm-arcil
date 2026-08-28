import type { Marcacao } from "@/lib/marcacao";

/**
 * Dados que alimentam a prévia técnica. Ficam num módulo próprio porque tanto
 * o compositor (`installation-overlay.ts`) quanto a camada ancorada
 * (`preview-annotations.ts`) precisam do tipo — se ele morasse no compositor,
 * os dois se importariam em círculo.
 */
export type DadosOverlay = {
  produto: string;
  marca: string | null;
  sku: string | null;
  tipoEquipamento: string;
  peDireito: string | null;
  alturaInstalacao: string;
  distanciaTeto: string;
  espacamentoLateral: string;
  tubulacao: string | null;
  pontoEletrico: boolean | null;
  alcapao: boolean | null;
  metragemInfra: string | null;
  /** Altura do gabinete (cm), vinda do ERP quando disponível ou do padrão por
   *  tipo+BTU (`resolveEquipmentSpecs`) — usada no painel de detalhe do
   *  plenum, nunca um número inventado na hora do desenho. */
  alturaGabineteCm: number | null;
  /** Largura do gabinete (cm). Vira a cota horizontal desenhada sobre a caixa
   *  marcada — é a medida que o instalador mais usa para saber se cabe. */
  larguraGabineteCm: number | null;
  /** `erp` quando a medida veio do cadastro do produto, `padrao_estimado`
   *  quando saiu da tabela por tipo+capacidade. A cota mostra "aprox." no
   *  segundo caso: apresentar estimativa como medida de catálogo é o mesmo
   *  erro do "2,80m" que originou toda a camada vetorial. */
  origemDimensoes: "erp" | "padrao_estimado";
  produtoImagemBase64: string | null;
  /** Bullets de garantia/instalação específicos do tipo de equipamento,
   *  vindos de `HVAC_STANDARDS[tipo].recomendacoes_garantia`. */
  recomendacoesGarantia: string[];
  /** Resposta livre do vendedor pra "onde ficará a unidade externa e a que
   *  distância aproximada" — alimenta o mini-esquema da condensadora. */
  unidadeExterna: string | null;
  /** Uma das 3 opções fixas da pergunta "acima/abaixo/mesmo nível do
   *  ambiente" — decide a posição da condensadora no mini-esquema. */
  nivelCondensadora: string | null;
  /** Capacidade formatada ("24.000 BTU/h") quando foi possível extrair — vai
   *  no card MODELO, como na referência aprovada. */
  capacidade: string | null;
  /** O que o vendedor desenhou sobre a foto. `null` = ele pulou a marcação, e
   *  a prévia cai no layout de cards, que não depende de saber onde o
   *  aparelho está na cena. */
  marcacao: Marcacao | null;
  /** Destino do QR do rodapé. `null` esconde o QR. */
  urlPrevia: string | null;
  /** `true` quando o QR leva ao manual oficial do fabricante; `false` quando
   *  leva à própria prévia. Muda o rótulo impresso ao lado dele — prometer
   *  "manual" e abrir a imagem é pior que não prometer nada. */
  qrEhManual?: boolean;
  /** Quem desenhou a tubulação na cena. Em `gemini_3d` o CRM não desenha o
   *  feixe: o modelo já colocou a tubulação em 3D, e desenhar por cima duplica
   *  a mesma informação em duas linguagens diferentes. */
  modoInfra?: "vetorial" | "gemini_3d";
  /** Força o layout V2 nesta composição, independentemente da feature flag.
   *  Existe para o comparativo lado a lado da mesma cena. */
  forcarV2?: boolean;
};
