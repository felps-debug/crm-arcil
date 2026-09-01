/**
 * Marcação que o vendedor desenha sobre a foto do ambiente.
 *
 * Toda coordenada é FRAÇÃO do lado da foto (0 a 1), nunca pixel. O vendedor
 * marca num `<img>` que o navegador escalou para caber na tela (largura
 * diferente no celular e no desktop), o Gemini devolve a cena num tamanho que
 * não escolhemos, e a camada vetorial é composta num terceiro tamanho. Fração
 * é a única unidade que sobrevive aos três.
 *
 * Este módulo é compartilhado entre cliente e servidor de propósito: o
 * componente de marcação produz o objeto, a rota valida o MESMO formato. Uma
 * validação escrita duas vezes é uma validação que diverge.
 */

export type PontoFrac = { x: number; y: number };
export type CaixaFrac = { x: number; y: number; w: number; h: number };

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

const frac = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= -0.5 && n <= 1.5 ? Math.min(1, Math.max(0, n)) : null;
};

/**
 * Converte o que chegou pelo corpo da requisição em `Marcacao`, ou `null`.
 *
 * `null` não é erro: significa "sem marcação", e o pipeline inteiro tem que
 * continuar funcionando sem ela (é o comportamento que existia antes desta
 * feature). Por isso nada aqui lança — entrada malformada e ausência de
 * marcação levam ao mesmo lugar, que é o fluxo antigo.
 *
 * A caixa tem piso de tamanho: uma caixa de 0.2% da foto é um toque acidental,
 * não uma marcação, e viraria um retângulo de 3px na imagem-guia — o modelo de
 * imagem ignoraria e nós ancoraríamos callouts num ponto sem sentido.
 */
export function parseMarcacao(bruto: unknown): Marcacao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const c = o.caixa as Record<string, unknown> | undefined;
  if (!c) return null;

  const x = frac(c.x);
  const y = frac(c.y);
  const w = frac(c.w);
  const h = frac(c.h);
  if (x == null || y == null || w == null || h == null) return null;
  if (w < 0.03 || h < 0.015) return null;

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

  return {
    caixa: { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h },
    // Uma rota de 1 ponto não é um caminho, é um toque solto — descartada aqui
    // em vez de virar uma "linha" de comprimento zero lá na frente.
    rota: rota.length >= 2 ? rota : [],
  };
}

/** Descrição textual da marcação para o prompt do n8n. Redundante com a
 *  imagem-guia de propósito: o modelo de imagem obedece muito melhor quando a
 *  máscara visual e o texto dizem a mesma coisa, e se a imagem-guia falhar em
 *  gerar (`guide-mask.ts` devolve null em erro), o texto ainda posiciona. */
export function descreverMarcacao(m: Marcacao): string {
  const cx = m.caixa.x + m.caixa.w / 2;
  const cy = m.caixa.y + m.caixa.h / 2;
  const horizontal = cx < 0.34 ? "no terço esquerdo" : cx > 0.66 ? "no terço direito" : "no centro horizontal";
  const vertical = cy < 0.34 ? "na parte alta" : cy > 0.66 ? "na parte baixa" : "na altura média";
  const largura = Math.round(m.caixa.w * 100);
  const partes = [
    `O vendedor marcou o local exato do equipamento: ${horizontal}, ${vertical} da foto, ocupando cerca de ${largura}% da largura da imagem`,
  ];
  if (m.rota.length >= 2) partes.push("e indicou a direção pra onde a infraestrutura sai do equipamento");
  return partes.join(", ") + ".";
}
