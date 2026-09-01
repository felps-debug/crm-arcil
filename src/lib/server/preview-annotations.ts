import { el, img, b64svg, type No } from "./satori-nodes";
import type { DadosOverlay } from "./previa-tipos";
import type { Marcacao, PontoFrac } from "@/lib/marcacao";
import { CLARO, CINZA, INFRA, ORDEM_INFRA, SOMBRA_TEXTO, FAIXA, TRACO_ORTOGONAL, TRACO_ORTOGONAL_PONTO } from "@/constants/arcil-brand";

/**
 * Camada técnica ANCORADA: callouts com linha de chamada, cotas, rota da
 * infraestrutura e fluxo de ar desenhados em cima da cena, cada um preso ao
 * lugar que o vendedor marcou na foto.
 *
 * Isto é a volta do antigo `cutaway-diagram.ts`, que foi desligado por um
 * motivo específico e ainda válido: ele dependia de o GPT-4o Vision adivinhar
 * a posição do aparelho numa grade 3x3, e errava de forma inconsistente — um
 * callout de dreno apontando para o sofá desqualifica a prévia inteira. O que
 * mudou não foi o desenho, foi a origem da âncora: agora ela vem do retângulo
 * que o próprio vendedor arrastou sobre a foto (`Marcacao`), com precisão de
 * fração de pixel. Nada aqui adivinha posição.
 *
 * Divisão que continua valendo: SVG desenha SÓ linha (o satori não aplica as
 * fontes que recebe dentro de um `<img>` de SVG, e `<text>` ali sai em branco).
 * Todo texto é nó satori de verdade, posicionado por cima em coordenada
 * absoluta.
 */

type Ponto = { x: number; y: number };
type Caixa = { cx: number; cy: number; w: number; h: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type Familia = "forro" | "parede" | "monobloco";
function familiaDe(tipo: string): Familia {
  const t = tipo.trim().toLowerCase();
  if (t === "cassete" || t === "dutado") return "forro";
  if (t === "janela") return "monobloco";
  return "parede";
}

// ---------------------------------------------------------------------------
// Formas de linha pura (SVG cru, sem <text>)
// ---------------------------------------------------------------------------

function setaDuplaVertical(x: number, y1: number, y2: number, cor: string): string {
  const cauda = Math.abs(y2 - y1) * 0.14;
  const s = Math.sign(y2 - y1) || 1;
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${cor}" stroke-width="1.6"/>` +
    `<path d="M ${x - 5} ${y1 + s * cauda} L ${x} ${y1} L ${x + 5} ${y1 + s * cauda}" fill="none" stroke="${cor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M ${x - 5} ${y2 - s * cauda} L ${x} ${y2} L ${x + 5} ${y2 - s * cauda}" fill="none" stroke="${cor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

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

/**
 * Polilinha deslocada `offset` px na perpendicular local.
 *
 * A normal de cada vértice é a média das normais dos dois segmentos vizinhos —
 * não a de um segmento só. Com a normal de um segmento apenas, cada curva da
 * rota abre um degrau visível entre as quatro linhas do feixe, e o que devia
 * ler como um conjunto de tubos correndo juntos vira quatro traços soltos.
 */
function polilinhaDeslocada(pontos: Ponto[], offset: number): string {
  if (pontos.length < 2) return "";
  const normais: Ponto[] = pontos.map((_, i) => {
    const anterior = pontos[Math.max(0, i - 1)];
    const seguinte = pontos[Math.min(pontos.length - 1, i + 1)];
    const dx = seguinte.x - anterior.x;
    const dy = seguinte.y - anterior.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
  return (
    "M " +
    pontos
      .map((p, i) => `${(p.x + normais[i].x * offset).toFixed(1)} ${(p.y + normais[i].y * offset).toFixed(1)}`)
      .join(" L ")
  );
}

/**
 * Ramer-Douglas-Peucker: joga fora os vértices que não mudam o traçado.
 *
 * O vendedor desenha com o dedo, então a rota chega com dezenas de pontos
 * quase colineares e a poucos pixels um do outro. Rodar o feixe de quatro
 * linhas por cima disso produz um traço trêmulo e engrossado nas curvas — cada
 * vértice tem sua própria normal e elas brigam entre si.
 */
function simplificar(pontos: Ponto[], tolerancia: number): Ponto[] {
  if (pontos.length <= 2) return pontos;
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const dx = ultimo.x - primeiro.x;
  const dy = ultimo.y - primeiro.y;
  const norma = Math.hypot(dx, dy) || 1;

  let indiceMaisLonge = 0;
  let maiorDistancia = 0;
  for (let i = 1; i < pontos.length - 1; i++) {
    const distancia = Math.abs((pontos[i].x - primeiro.x) * dy - (pontos[i].y - primeiro.y) * dx) / norma;
    if (distancia > maiorDistancia) {
      maiorDistancia = distancia;
      indiceMaisLonge = i;
    }
  }
  if (maiorDistancia <= tolerancia) return [primeiro, ultimo];
  return [
    ...simplificar(pontos.slice(0, indiceMaisLonge + 1), tolerancia).slice(0, -1),
    ...simplificar(pontos.slice(indiceMaisLonge), tolerancia),
  ];
}

/** Chaikin: corta cada canto em dois, duas vezes. Transforma a polilinha em
 *  algo que lê como tubo dobrado, sem precisar de curva paramétrica — e o
 *  resultado continua sendo uma lista de pontos, que é o que o deslocamento
 *  perpendicular do feixe sabe consumir. */
function suavizar(pontos: Ponto[], passadas = 2): Ponto[] {
  let atual = pontos;
  for (let passada = 0; passada < passadas; passada++) {
    if (atual.length < 3) return atual;
    const novo: Ponto[] = [atual[0]];
    for (let i = 0; i < atual.length - 1; i++) {
      const a = atual[i];
      const b = atual[i + 1];
      novo.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      novo.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    novo.push(atual[atual.length - 1]);
    atual = novo;
  }
  return atual;
}

/**
 * Prolonga a rota até sair do quadro, mantendo a direção do último trecho.
 *
 * O vendedor quase sempre para de desenhar no meio do caminho — ele já indicou
 * a direção e considera o recado dado. Sem isto, o feixe de cobre terminava no
 * ar, no meio da parede, como se a tubulação acabasse ali.
 */
function prolongarAteBorda(pontos: Ponto[], W: number, H: number): Ponto[] {
  if (pontos.length < 2) return pontos;
  const fim = pontos[pontos.length - 1];

  // A direção vem de um trecho do fim, não do último segmento: o vendedor
  // levanta o dedo com um tremor, e o último par de pontos costuma apontar para
  // trás. Usando só ele, a extensão saiu atravessando a cena inteira para o
  // lado oposto ao que ele tinha desenhado.
  const alcanceRe = Math.min(W, H) * 0.12;
  let referencia = pontos[0];
  let percorrido = 0;
  for (let i = pontos.length - 1; i > 0; i--) {
    percorrido += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y);
    referencia = pontos[i - 1];
    if (percorrido >= alcanceRe) break;
  }
  const dx = fim.x - referencia.x;
  const dy = fim.y - referencia.y;
  const comprimento = Math.hypot(dx, dy);
  if (comprimento < Math.min(W, H) * 0.01) return pontos;

  const margemBorda = Math.min(W, H) * 0.02;
  const jaNaBorda = fim.x <= margemBorda || fim.x >= W - margemBorda || fim.y <= margemBorda || fim.y >= H - margemBorda;
  if (jaNaBorda) return pontos;

  // Quanto falta para cruzar cada borda seguindo a direção atual; vale a
  // primeira que for cruzada.
  const passos: number[] = [];
  if (dx > 0) passos.push((W + 20 - fim.x) / dx);
  if (dx < 0) passos.push((-20 - fim.x) / dx);
  if (dy > 0) passos.push((H + 20 - fim.y) / dy);
  if (dy < 0) passos.push((-20 - fim.y) / dy);
  const passo = Math.min(...passos.filter((t) => t > 0));
  if (!Number.isFinite(passo)) return pontos;

  // Teto no comprimento da extensão: passado disso ela deixa de ser "o vendedor
  // parou de desenhar" e vira um palpite atravessando o ambiente inteiro.
  const maximo = Math.hypot(W, H) * 0.3;
  const fator = Math.min(passo, maximo / comprimento);
  return [...pontos, { x: fim.x + dx * fator, y: fim.y + dy * fator }];
}

/** Cota horizontal com o valor ao lado da seta, no lugar de embaixo dela: sob
 *  o aparelho fica o leque de ar, e um número no meio do leque some. */
function setaDuplaHorizontal(y: number, x1: number, x2: number, cor: string): string {
  const cauda = Math.abs(x2 - x1) * 0.1;
  const s = Math.sign(x2 - x1) || 1;
  return (
    `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${cor}" stroke-width="1.5"/>` +
    `<path d="M ${(x1 + s * cauda).toFixed(1)} ${(y - 4).toFixed(1)} L ${x1.toFixed(1)} ${y.toFixed(1)} L ${(x1 + s * cauda).toFixed(1)} ${(y + 4).toFixed(1)}" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M ${(x2 - s * cauda).toFixed(1)} ${(y - 4).toFixed(1)} L ${x2.toFixed(1)} ${y.toFixed(1)} L ${(x2 - s * cauda).toFixed(1)} ${(y + 4).toFixed(1)}" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/**
 * Corta a polilinha no ponto em que ela cruza a borda da coluna de cards.
 *
 * `sentido` diz de que lado da borda a rota pode ficar: -1 mantém o que está à
 * esquerda da borda, 1 mantém o que está à direita. O ponto de corte é
 * interpolado no segmento que cruza, então o traço termina exatamente na borda
 * em vez de parar no vértice anterior (que deixaria um vão visível).
 */
function recortarNaColuna(pontos: Ponto[], borda: number, sentido: 1 | -1): Ponto[] {
  const dentro = (p: Ponto) => (sentido === -1 ? p.x <= borda : p.x >= borda);
  const saida: Ponto[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    if (dentro(p)) {
      saida.push(p);
      continue;
    }
    const anterior = pontos[i - 1];
    if (anterior && dentro(anterior)) {
      const t = (borda - anterior.x) / (p.x - anterior.x);
      saida.push({ x: borda, y: anterior.y + (p.y - anterior.y) * t });
    }
    break;
  }
  // Um único ponto não desenha nada; nesse caso vale mais mostrar a rota
  // original inteira do que sumir com a infraestrutura da prévia.
  return saida.length >= 2 ? saida : pontos;
}

/** Feixe de 4 linhas (ida, retorno, elétrico, dreno) seguindo a mesma rota,
 *  nas MESMAS cores da legenda desenhada no canto — os dois lados leem
 *  `INFRA` de `arcil-brand.ts`, então não há como uma mudar sem a outra. */
function feixeInfra(pontos: Ponto[], escala: number): string {
  const larguraBase = Math.max(2.2, escala * 3.2);
  const passo = larguraBase * 1.55;
  const offsets = [-1.5, -0.5, 0.5, 1.5].map((k) => k * passo);
  return ORDEM_INFRA.map((chave, i) => {
    const spec = INFRA[chave];
    const d = polilinhaDeslocada(pontos, offsets[i]);
    if (!d) return "";
    const tracejado = "tracejado" in spec && spec.tracejado ? ` stroke-dasharray="${larguraBase * 3} ${larguraBase * 2}"` : "";
    return (
      `<path d="${d}" fill="none" stroke="rgba(6,10,18,0.5)" stroke-width="${larguraBase + 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="${spec.cor}" stroke-width="${larguraBase}" stroke-linecap="round" stroke-linejoin="round"${tracejado}/>`
    );
  }).join("");
}

function defsFluxo(id: string, origem: Ponto, raio: number): string {
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${origem.x}" cy="${origem.y}" r="${raio}">
    <stop offset="0%" stop-color="#DCEBFF" stop-opacity="0.62"/>
    <stop offset="55%" stop-color="#DCEBFF" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#DCEBFF" stop-opacity="0"/>
  </radialGradient>`;
}

/** Pétala de fluxo de ar: nasce estreita no aparelho e abre em leque, com
 *  entalhe em V na ponta. O entalhe é o que faz várias pétalas saindo do mesmo
 *  ponto lerem como setas distintas em vez de uma mancha só. 0° = para baixo. */
function petalaFluxo(origem: Ponto, anguloGraus: number, comprimento: number, larguraTopo: number, gradId: string): string {
  const rad = (anguloGraus * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = Math.cos(rad);
  const perpX = -dy;
  const perpY = dx;
  const larguraBase = larguraTopo * 0.22;
  const baseA = { x: origem.x + (perpX * larguraBase) / 2, y: origem.y + (perpY * larguraBase) / 2 };
  const baseB = { x: origem.x - (perpX * larguraBase) / 2, y: origem.y - (perpY * larguraBase) / 2 };
  const pontaCentro = { x: origem.x + dx * comprimento, y: origem.y + dy * comprimento };
  const pontaA = { x: pontaCentro.x + (perpX * larguraTopo) / 2, y: pontaCentro.y + (perpY * larguraTopo) / 2 };
  const pontaB = { x: pontaCentro.x - (perpX * larguraTopo) / 2, y: pontaCentro.y - (perpY * larguraTopo) / 2 };
  const entalhe = { x: origem.x + dx * comprimento * 0.8, y: origem.y + dy * comprimento * 0.8 };
  const meioA = { x: (baseA.x + pontaA.x) / 2 + perpX * larguraTopo * 0.14, y: (baseA.y + pontaA.y) / 2 + perpY * larguraTopo * 0.14 };
  const meioB = { x: (baseB.x + pontaB.x) / 2 - perpX * larguraTopo * 0.14, y: (baseB.y + pontaB.y) / 2 - perpY * larguraTopo * 0.14 };
  return `<path d="M ${baseA.x} ${baseA.y} Q ${meioA.x} ${meioA.y} ${pontaA.x} ${pontaA.y} L ${entalhe.x} ${entalhe.y} L ${pontaB.x} ${pontaB.y} Q ${meioB.x} ${meioB.y} ${baseB.x} ${baseB.y} Z" fill="url(#${gradId})"/>`;
}

/** Silhueta "raio-x" do gabinete acima do forro — o corpo da unidade que fica
 *  escondido no plenum, como na referência aprovada. É estilizado de propósito
 *  (retângulo com nervuras), não um retrato: a foto do produto mostra o painel
 *  visto de baixo, e não existe informação nenhuma sobre como o corpo dele
 *  aparece de lado nesta cena. Desenhar um retrato falso seria pior que uma
 *  silhueta honesta. */
function fantasmaGabinete(caixa: Caixa, topoMinimo: number): { svg: string; base: number; topo: number } {
  const w = caixa.w * 0.82;
  const base = caixa.cy - caixa.h / 2 - caixa.h * 0.35;
  const x = caixa.cx - w / 2;
  // A silhueta encolhe se não couber entre o aparelho e o topo útil. Com altura
  // fixa ela saía cortada pela borda de cima em foto de pé-direito baixo — e o
  // que o cliente via era um retângulo sem topo, que não lê como equipamento.
  const h = Math.max(caixa.h * 0.9, Math.min(caixa.h * 2.4, base - topoMinimo - caixa.h * 0.9));
  const y = base - h;
  const nervuras = Array.from({ length: 5 }, (_, i) => {
    const nx = x + (w * (i + 1)) / 6;
    return `<line x1="${nx.toFixed(1)}" y1="${(y + h * 0.18).toFixed(1)}" x2="${nx.toFixed(1)}" y2="${(y + h * 0.82).toFixed(1)}" stroke="rgba(242,246,252,0.28)" stroke-width="1"/>`;
  }).join("");
  const tirante = Math.min(caixa.h * 0.9, Math.max(0, y - topoMinimo));
  const svg =
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="rgba(210,226,245,0.13)" stroke="rgba(242,246,252,0.5)" stroke-width="1.3"/>` +
    nervuras +
    // Tirantes de fixação na laje: dois riscos verticais saindo do topo, que é
    // exatamente o que o passo a passo do cassete manda fazer ("fixar os
    // tirantes na laje") — o desenho e o texto contam a mesma instalação.
    `<line x1="${(x + w * 0.15).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + w * 0.15).toFixed(1)}" y2="${(y - tirante).toFixed(1)}" stroke="rgba(242,246,252,0.45)" stroke-width="1.2"/>` +
    `<line x1="${(x + w * 0.85).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + w * 0.85).toFixed(1)}" y2="${(y - tirante).toFixed(1)}" stroke="rgba(242,246,252,0.45)" stroke-width="1.2"/>`;
  return { svg, base, topo: y };
}

// ---------------------------------------------------------------------------
// Callouts (texto satori + linha de chamada)
// ---------------------------------------------------------------------------

type Callout = {
  left: number;
  top: number;
  width: number;
  titulo: string;
  corpo: string | null;
  cor: string;
  align: "left" | "right" | "center";
  /** Para onde a linha pontilhada aponta. `null` = callout sem chamada. */
  alvo: Ponto | null;
};

function calloutNo(c: Callout): No {
  return el(
    "div",
    {
      position: "absolute",
      left: c.left,
      top: c.top,
      width: c.width,
      flexDirection: "column",
      alignItems: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start",
    },
    el(
      "div",
      { fontSize: 13, fontWeight: 700, color: c.cor, letterSpacing: 0.7, textShadow: SOMBRA_TEXTO, textAlign: c.align, lineHeight: 1.25 },
      c.titulo
    ),
    c.corpo
      ? el(
          "div",
          {
            fontSize: 12,
            color: CLARO,
            marginTop: 3,
            lineHeight: 1.35,
            textShadow: SOMBRA_TEXTO,
            textAlign: c.align,
            width: c.width,
            // `textAlign` sozinho não alinha corpo de UMA linha: o nó é um
            // container flex de largura fixa, e o satori posiciona o texto
            // dentro dele por `justifyContent`, não por `textAlign` (que só
            // atua quando o texto quebra em várias linhas). Sem isto, "2,70 m"
            // saía grudado na esquerda embaixo de um título alinhado à direita.
            justifyContent: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
          },
          c.corpo
        )
      : null
  );
}

/** Ponto da borda do callout de onde a linha de chamada sai — a borda voltada
 *  para o alvo, não o canto superior esquerdo (que produzia chamadas cruzando
 *  o próprio texto). */
function saidaDoCallout(c: Callout, alturaEstimada: number): Ponto {
  const y = c.top + alturaEstimada / 2;
  if (c.align === "right") return { x: c.left + c.width, y };
  if (c.align === "center") return { x: c.left + c.width / 2, y: c.top + alturaEstimada };
  return { x: c.left, y };
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

export type PlanoAnotacoes = {
  /** SVG cru, só linhas — vira um `<img>` de fundo na árvore do compositor. */
  linhas: string;
  /** Nós satori posicionados em absoluto por cima do SVG. */
  nos: No[];
};

type Retangulo = { x: number; y: number; w: number; h: number };

const colide = (a: Retangulo, b: Retangulo) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Aloca cada callout no primeiro lugar livre da sua lista de candidatos.
 *
 * As versões anteriores posicionavam cada texto por uma regra própria ("ao lado
 * do alvo", "no slot da coluna", "abaixo dos cards"), e cada regra era correta
 * isolada — o que faltava era alguém sabendo onde os OUTROS já estavam. Com
 * cinco ou seis callouts na mesma prévia eles se sobrepunham entre si e por
 * cima do equipamento. Aqui todo mundo passa pelo mesmo controle, e o que já
 * foi colocado vira área ocupada para quem vem depois.
 */
class Alocador {
  private ocupados: Retangulo[] = [];

  constructor(
    private readonly W: number,
    private readonly H: number,
    private readonly margem: number
  ) {}

  reservar(r: Retangulo) {
    this.ocupados.push(r);
  }

  /** @returns canto superior esquerdo escolhido, ou `null` se nada coube. */
  alocar(candidatos: { x: number; y: number }[], w: number, h: number): { x: number; y: number } | null {
    for (const c of candidatos) {
      const x = Math.min(Math.max(c.x, this.margem), this.W - this.margem - w);
      const y = Math.min(Math.max(c.y, this.H * 0.02), this.H - h - this.H * 0.02);
      const r = { x, y, w, h };
      if (!this.ocupados.some((o) => colide(r, o))) {
        this.ocupados.push(r);
        return { x, y };
      }
    }
    return null;
  }
}

/**
 * Altura aproximada do callout renderizado.
 *
 * O satori só mede na hora do render, então a colisão precisa de uma estimativa
 * feita aqui. Ela é deliberadamente generosa: errar para mais deixa um respiro
 * a mais entre dois textos, errar para menos deixa um por cima do outro.
 */
function alturaCallout(titulo: string, corpo: string | null, largura: number, escala: number): number {
  const linhas = (texto: string, px: number) => Math.max(1, Math.ceil(texto.length / Math.max(8, largura / (px * 0.56))));
  const alturaTitulo = linhas(titulo, 13 * escala) * 17 * escala;
  const alturaCorpo = corpo ? linhas(corpo, 12 * escala) * 16.5 * escala + 4 : 0;
  return alturaTitulo + alturaCorpo + 6;
}

/**
 * Monta o plano de anotações a partir da marcação exata do vendedor.
 *
 * `ladoTexto` (1 = direita, -1 = esquerda) é decidido pelo compositor: é o lado
 * OPOSTO à coluna de cards, e é onde os callouts preferem ficar.
 *
 * @param W,H tamanho em pixels da cena já gerada (o modelo de imagem devolve
 *   num tamanho que não escolhemos — por isso a marcação é fração, não pixel).
 */
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
    cx: (m.caixa.x + m.caixa.w / 2) * W,
    cy: (m.caixa.y + m.caixa.h / 2) * H,
    w: m.caixa.w * W,
    h: m.caixa.h * H,
  };

  const linhas: string[] = [];
  const margem = W * FAIXA.margemFrac;
  const larguraCallout = W * 0.2;
  const larguraCards = W * 0.21;
  const xCards = ladoTexto === 1 ? margem : W - margem - larguraCards;
  const xTexto = ladoTexto === 1 ? W - margem - larguraCallout : margem;

  const aloc = new Alocador(W, H, margem);
  // Coluna de cards e rodapé institucional: território de quem desenha depois.
  aloc.reservar({ x: xCards - W * 0.015, y: 0, w: larguraCards + W * 0.03, h: H * 0.66 });
  // A moldura institucional do rodapé não é uma faixa cheia: são três blocos
  // com espaço livre entre eles. Reservar a faixa inteira custava três callouts
  // por prévia — some informação que o vendedor marcou por causa de área que
  // ninguém ocupa.
  aloc.reservar({ x: 0, y: H * 0.77, w: W * 0.32, h: H * 0.17 });                    // selo de aprovação
  aloc.reservar({ x: W * 0.7, y: H * 0.68, w: W * 0.3, h: H * 0.27 });               // card de lembretes
  aloc.reservar({ x: 0, y: H * 0.93, w: W, h: H * 0.07 });                           // logo, QR e rodapé legal
  // O próprio equipamento, com folga: nenhum texto pode cair em cima dele.
  aloc.reservar({
    x: caixa.cx - caixa.w * 0.62,
    y: caixa.cy - caixa.h * 0.85,
    w: caixa.w * 1.24,
    h: caixa.h * 1.7,
  });

  const callouts: Callout[] = [];
  const empurrar = (
    titulo: string,
    corpo: string | null,
    cor: string,
    alvo: Ponto | null,
    preferidos: { x: number; y: number }[]
  ) => {
    const h = alturaCallout(titulo, corpo, larguraCallout, escala);
    // Grade fina de propósito. Com passo largo (0,12 da altura) um aparelho
    // grande no meio do quadro bloqueava dois ou três slots de uma vez e sobrava
    // lugar para menos callouts do que a cena comportava — o ponto elétrico, que
    // o vendedor tinha marcado a dedo, ficava de fora.
    const slots: { x: number; y: number }[] = [];
    for (let f = 0.05; f <= 0.72; f += 0.055) slots.push({ x: xTexto, y: H * f });
    const slotsOpostos: { x: number; y: number }[] = [];
    for (let f = 0.05; f <= 0.72; f += 0.055) {
      slotsOpostos.push({ x: ladoTexto === 1 ? margem : W - margem - larguraCallout, y: H * f });
    }
    const pos = aloc.alocar([...preferidos, ...slots, ...slotsOpostos], larguraCallout, h);
    // Sem lugar livre o callout simplesmente não é desenhado. Um texto ilegível
    // por cima de outro informa menos que a ausência dele — e a mesma
    // informação está nos cards.
    if (!pos) return;
    callouts.push({ left: pos.x, top: pos.y, width: larguraCallout, titulo, corpo, cor, align: pos.x < W / 2 ? "left" : "right", alvo });
  };

  // Lado por onde a infraestrutura corre: se o vendedor traçou a rota, é o lado
  // para onde ela vai de fato — não um palpite de "onde sobra espaço".
  const ladoRota: 1 | -1 = m.rota.length >= 2 ? (m.rota[m.rota.length - 1].x * W >= caixa.cx ? 1 : -1) : caixa.cx <= W / 2 ? 1 : -1;

  // --- Rota da infraestrutura ------------------------------------------------
  const rotaDesenhada: Ponto[] =
    m.rota.length >= 2
      ? suavizar(prolongarAteBorda(simplificar(m.rota.map((p: PontoFrac) => ({ x: p.x * W, y: p.y * H })), Math.min(W, H) * 0.004), W, H))
      : [
          { x: caixa.cx + ladoRota * (caixa.w / 2), y: caixa.cy - caixa.h * 0.1 },
          { x: caixa.cx + ladoRota * caixa.w * 1.6, y: caixa.cy - caixa.h * 0.35 },
          { x: ladoRota === 1 ? W + 20 : -20, y: clamp(caixa.cy - caixa.h * 0.6, H * FAIXA.topoFrac, H * FAIXA.baseFrac) },
        ];
  const rotaPx = rotaDesenhada;

  // A coluna de cards ocupa uma faixa vertical inteira de um dos lados. O feixe
  // desenhado até a borda passava por cima da legenda — e uma legenda de cores
  // atravessada pelas próprias linhas que ela explica é ilegível.
  const folgaCards = W * 0.022;
  const bordaCards = ladoTexto === 1 ? xCards + larguraCards + folgaCards : xCards - folgaCards;
  const rotaVisivel = recortarNaColuna(rotaPx, bordaCards, ladoTexto === 1 ? 1 : -1);
  // O gate para `gemini_3d` (o modelo já desenha a tubulação em volume, com
  // sombra, na cena — o mesmo erro que o layout do cassete comercial evita em
  // `cassette-commercial-layout.ts`) agora é o early-return no topo desta
  // função: chegando aqui, o modo é sempre `vetorial`.
  linhas.push(feixeInfra(rotaVisivel, escala));

  // --- Silhueta acima do forro + cota do plenum ------------------------------
  // O topo útil é mais baixo que `FAIXA.topoFrac` porque o selo "Design created
  // by ARCIL AI" é composto depois, colado na borda de cima.
  const topoUtilCena = H * 0.085;
  const cabeFantasma = familia === "forro" && caixa.cy - caixa.h / 2 - topoUtilCena > caixa.h * 1.1;
  if (cabeFantasma) {
    const fantasma = fantasmaGabinete(caixa, topoUtilCena);
    linhas.push(fantasma.svg);
    const xCota = clamp(caixa.cx - caixa.w * 0.46, margem + 40, W - margem - 40);
    linhas.push(setaDuplaVertical(xCota, fantasma.topo, caixa.cy - caixa.h / 2, CLARO));
    aloc.reservar({ x: xCota - W * 0.02, y: fantasma.topo, w: W * 0.13, h: caixa.cy - caixa.h / 2 - fantasma.topo });
    callouts.push({
      left: xCota + 9,
      top: (fantasma.topo + caixa.cy - caixa.h / 2) / 2 - 9 * escala,
      width: W * 0.1,
      titulo: d.distanciaTeto,
      corpo: null,
      cor: CLARO,
      align: "left",
      alvo: null,
    });
  }

  // --- Cota de largura do gabinete -------------------------------------------
  // A medida que o instalador mais usa ("cabe nesse trecho de parede?") e a que
  // dá noção de escala ao cliente. Sai do mesmo `resolveEquipmentSpecs` que
  // alimenta os cards — nunca de uma medição feita em cima da foto, que não tem
  // referência de escala nenhuma.
  if (d.larguraGabineteCm) {
    const aproximado = d.origemDimensoes === "padrao_estimado";
    const rotulo = `${aproximado ? "≈ " : ""}${d.larguraGabineteCm} cm`;
    // Acima do aparelho em instalação de parede (teto costuma estar vazio);
    // abaixo em instalação de forro, onde o espaço de cima é do plenum.
    const acima = familia !== "forro";
    const yCota = acima ? caixa.cy - caixa.h / 2 - H * 0.018 : caixa.cy + caixa.h / 2 + H * 0.018;
    const x1 = caixa.cx - caixa.w / 2;
    const x2 = caixa.cx + caixa.w / 2;
    linhas.push(setaDuplaHorizontal(yCota, x1, x2, CLARO));
    // Tracinhos de extensão nas pontas, como em desenho técnico — sem eles a
    // seta parece flutuar solta acima do aparelho.
    const traco = H * 0.012;
    for (const x of [x1, x2]) {
      linhas.push(
        `<line x1="${x.toFixed(1)}" y1="${(yCota - (acima ? -traco : traco)).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(yCota + (acima ? -traco : traco) * 0.4).toFixed(1)}" stroke="rgba(242,246,252,0.6)" stroke-width="1"/>`
      );
    }
    const larguraRotulo = W * 0.075;
    const leftRotulo = clamp(x2 + W * 0.008, margem, W - margem - larguraRotulo);
    callouts.push({
      left: leftRotulo,
      top: yCota - 9 * escala,
      width: larguraRotulo,
      titulo: rotulo,
      corpo: null,
      cor: CLARO,
      align: "left",
      alvo: null,
    });
    aloc.reservar({ x: x1, y: yCota - H * 0.025, w: caixa.w + larguraRotulo + W * 0.01, h: H * 0.05 });
  }

  // --- Fluxo de ar -----------------------------------------------------------
  // Entra antes dos demais porque o rótulo dele é o único que precisa mesmo
  // ficar embaixo do aparelho; os outros aceitam ir para a coluna.
  if (familia !== "monobloco") {
    const origem: Ponto = { x: caixa.cx, y: caixa.cy + caixa.h / 2 };
    const comprimento = H * 0.115;
    const gradId = "fluxoAncorado";
    linhas.push(defsFluxo(gradId, origem, comprimento * 1.15));
    const t = d.tipoEquipamento.trim().toLowerCase();
    const angulos = t === "cassete" ? [-54, -19, 19, 54] : t === "dutado" ? [-15, 15] : [-32, 0, 32];
    angulos.forEach((a) => linhas.push(petalaFluxo(origem, a, comprimento, W * 0.075, gradId)));
    aloc.reservar({ x: caixa.cx - W * 0.075, y: origem.y, w: W * 0.15, h: comprimento });

    empurrar(
      "FLUXO DE AR",
      t === "cassete"
        ? "Distribuição uniforme nos 4 sentidos."
        : t === "dutado"
          ? "Distribuição pela rede de dutos e grelhas."
          : "Distribuição direcionada para o ambiente.",
      CLARO,
      null,
      [{ x: caixa.cx - larguraCallout / 2, y: origem.y + comprimento + H * 0.012 }]
    );
  }

  // --- Callouts --------------------------------------------------------------
  const descricaoPorFamilia: Record<Familia, string> = {
    forro: "Instalação embutida no forro, com distribuição de ar integrada ao ambiente.",
    parede: "Unidade evaporadora fixada na parede, com afastamentos de manutenção respeitados.",
    monobloco: "Peça única instalada no vão, sem unidade externa separada.",
  };
  // Título curto de propósito: "EVAPORADORA SPLIT HI-WALL" quebrava em duas
  // linhas dentro da caixa e o tipo já aparece no card MODELO.
  empurrar("EVAPORADORA", descricaoPorFamilia[familia], CLARO, { x: caixa.cx - ladoTexto * caixa.w * 0.5, y: caixa.cy - caixa.h * 0.4 }, [
    { x: xTexto, y: H * 0.05 },
  ]);

  // Ponto elétrico não tem marca própria na foto (a pergunta "já existe ponto
  // elétrico?" já cobre isso) — a informação vive só nos cards, nunca como
  // callout apontando pra um lugar que ninguém marcou.

  // --- Cota do pé-direito ----------------------------------------------------
  if (d.peDireito) {
    // Família forro não ganha linha vertical: o número respondido ali é a altura
    // entre a laje e o forro, não o pé-direito do ambiente — uma linha do teto
    // ao piso estaria medindo outra coisa.
    const bordaInternaTexto = ladoTexto === 1 ? xTexto : xTexto + larguraCallout;
    const bordaAparelho = ladoTexto === 1 ? caixa.cx + caixa.w / 2 : caixa.cx - caixa.w / 2;
    const vao = Math.abs(bordaInternaTexto - bordaAparelho);
    const xPe = (bordaInternaTexto + bordaAparelho) / 2;
    // A linha corre de cima a baixo do quadro. Se ela cair dentro da faixa da
    // coluna de texto, o retângulo que a protege bloqueia TODOS os slots da
    // coluna — e os callouts seguintes somem por falta de lugar. Foi o que
    // aconteceu na primeira prévia real: pé-direito e ponto elétrico, os dois
    // marcados pelo vendedor, não foram desenhados.
    const dentroDaColunaDeTexto = xPe > xTexto - W * 0.01 && xPe < xTexto + larguraCallout + W * 0.01;
    if (familia !== "forro" && !dentroDaColunaDeTexto && vao > W * 0.07) {
      const yTopo = H * (FAIXA.topoFrac + 0.05);
      // Para na altura do peitoril: uma linha do teto ao chão corta a foto do
      // cliente ao meio e passa a ler como divisória do ambiente.
      const yBase = H * 0.66;
      // Gate para `gemini_3d` (a linha de cota também seria responsabilidade
      // do modelo ali) também virou o early-return do topo da função — não
      // precisa repetir a checagem aqui.
      linhas.push(
        `<line x1="${xPe.toFixed(1)}" y1="${yTopo.toFixed(1)}" x2="${xPe.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="rgba(242,246,252,0.65)" stroke-width="1.2" stroke-dasharray="3 5"/>`
      );
      linhas.push(setaDuplaVertical(xPe, yTopo, yBase, CLARO));
      aloc.reservar({ x: xPe - W * 0.012, y: yTopo, w: W * 0.024, h: yBase - yTopo });
    }
    empurrar(familia === "forro" ? "ALTURA LAJE-FORRO" : "PÉ-DIREITO APROX.", d.peDireito, CLARO, null, [{ x: xTexto, y: H * 0.29 }]);
  }

  // --- Ligação até a condensadora -------------------------------------------
  const fimRota = rotaVisivel[rotaVisivel.length - 1];
  const alvoLigacao: Ponto = {
    x: clamp(fimRota.x, margem + 10, W - margem - 10),
    y: clamp(fimRota.y, H * (FAIXA.topoFrac + 0.02), H * FAIXA.baseFrac - 10),
  };
  empurrar(
    "LIGAÇÃO ATÉ CONDENSADORA",
    d.unidadeExterna ? `Caminho da infraestrutura até a unidade externa: ${d.unidadeExterna}.` : "Caminho da infraestrutura até a unidade externa.",
    CLARO,
    alvoLigacao,
    [
      { x: alvoLigacao.x - larguraCallout / 2, y: alvoLigacao.y + H * 0.05 },
      // Puxado para o lado de dentro: com a rota terminando junto à coluna de
      // cards, centrar no alvo joga metade do texto por baixo dela.
      { x: alvoLigacao.x - larguraCallout - W * 0.02, y: alvoLigacao.y + H * 0.03 },
      { x: xTexto, y: H * 0.41 },
    ]
  );

  if (familia !== "monobloco") {
    empurrar(
      familia === "forro" ? "FORRO ATÉ LAJE" : "DISTÂNCIA DO TETO",
      familia === "forro" ? "Espaço técnico para unidade e infraestrutura." : `Afastamento até o teto: ${d.distanciaTeto}.`,
      CLARO,
      { x: caixa.cx, y: caixa.cy - caixa.h / 2 - H * 0.015 },
      [{ x: xTexto, y: H * 0.17 }]
    );
  }

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

  return { linhas: linhas.join(""), nos: callouts.map(calloutNo) };
}

/** Legenda de cores da infraestrutura, no formato da referência aprovada:
 *  traço colorido + rótulo, um por linha. Lê o mesmo `INFRA` que colore o
 *  feixe na cena. */
export function legendaInfraNo(largura: number): No {
  return el(
    "div",
    { width: largura, flexDirection: "column" },
    el("div", { fontSize: 13, fontWeight: 700, color: CLARO, letterSpacing: 0.7, textShadow: SOMBRA_TEXTO, marginBottom: 7 }, "INFRAESTRUTURA FRIGORÍGENA"),
    ...ORDEM_INFRA.map((chave) => {
      const spec = INFRA[chave];
      const tracejado = "tracejado" in spec && spec.tracejado;
      return el(
        "div",
        { alignItems: "center", marginBottom: 5 },
        tracejado
          ? el(
              "div",
              { width: 24, alignItems: "center", marginRight: 9, flexShrink: 0 },
              ...[0, 1, 2].map(() => el("div", { width: 6, height: 3, borderRadius: 2, background: spec.cor, marginRight: 3 }))
            )
          : el("div", { width: 24, height: 3, borderRadius: 2, background: spec.cor, marginRight: 9, flexShrink: 0 }),
        el("div", { fontSize: 12, color: CLARO, textShadow: SOMBRA_TEXTO }, spec.rotulo)
      );
    })
  );
}

/** Painel "ÁREA TÉCNICA EXTERNA" com a foto oficial do produto vinda do ERP.
 *  Devolve `null` sem foto — um painel vazio com o título é pior que nenhum
 *  painel, porque promete uma informação que não está lá. */
export function painelCondensadoraNo(d: DadosOverlay, largura: number, fundo: string, borda: string, raio: number): No | null {
  if (!d.produtoImagemBase64) return null;
  const alturaFoto = largura * 0.58;
  return el(
    "div",
    {
      width: largura,
      flexDirection: "column",
      alignItems: "center",
      background: fundo,
      border: `1px solid ${borda}`,
      borderRadius: raio,
      padding: "12px 12px 11px",
    },
    // O ERP fotografa o CONJUNTO (evaporadora, condensadora e controle numa
    // imagem só). Chamar isso de "área técnica externa" descreve errado o que
    // está na foto — o cliente vê a evaporadora dentro do quadro da unidade
    // externa.
    el("div", { fontSize: 12, fontWeight: 700, color: CLARO, letterSpacing: 0.9, textShadow: SOMBRA_TEXTO }, "EQUIPAMENTO"),
    el("div", { fontSize: 9.5, color: CINZA, marginTop: 1, letterSpacing: 0.6 }, "(ILUSTRATIVO)"),
    img(d.produtoImagemBase64, { width: largura - 24, height: alturaFoto, objectFit: "contain", marginTop: 8 }),
    el(
      "div",
      { fontSize: 10.5, color: CLARO, marginTop: 8, lineHeight: 1.35, width: largura - 24 },
      d.unidadeExterna ? `Local previsto: ${d.unidadeExterna}.` : "Local da condensadora a confirmar no local."
    ),
    d.nivelCondensadora
      ? el("div", { fontSize: 10, color: CINZA, marginTop: 2, width: largura - 24 }, `Nível: ${d.nivelCondensadora.toLowerCase()}.`)
      : null
  );
}

/** Envelope SVG das linhas do plano, pronto para virar `<img>` na árvore. */
export function svgDasLinhas(linhas: string, W: number, H: number): string {
  return b64svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${linhas}</svg>`);
}
