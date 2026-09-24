import { el, img, b64svg, logoArcil, type No } from "../satori-nodes";
import { tubulacaoPeloModelo, type DadosOverlay } from "../previa-tipos";
import type { Marcacao, PontoFrac } from "@/lib/marcacao";
import {
  INFRA,
  ORDEM_INFRA,
  V2_VIDRO,
  V2_VIDRO_BORDA,
  V2_RAIO,
  V2_TEXTO,
  V2_TEXTO_SUAVE,
  V2_TEXTO_FRACO,
  V2_TRACO,
  V2_TRACO_FORTE,
  V2_TIPO,
  V2_ZONAS_CASSETE,
  V2_CHAMADA_MAX_DIAGONAL,
  SELO_APROVACAO,
  RODAPE_LEGAL,
} from "@/constants/arcil-brand";

/**
 * Layout Commercial Technical V2 — cassete.
 *
 * A V1 posicionava tudo por colisão: cada callout procurava um lugar livre e o
 * resultado mudava de prévia para prévia. Funcionava, mas duas prévias do mesmo
 * produto não tinham a mesma cara — e o que o cliente recebe é peça de marca.
 *
 * Aqui a ordem é outra: **zona preferencial primeiro**, colisão só como
 * desempate. Cada elemento tem um lugar definido no template (`V2_ZONAS_CASSETE`),
 * derivado da referência aprovada. Se a zona estiver ocupada, o elemento desliza;
 * se não couber em lugar nenhum, ele não é desenhado.
 *
 * Diferenças visuais deliberadas em relação à V1:
 *
 * - **Vidro, não card escuro.** O fundo dos cards passou de quase opaco para
 *   translúcido: a fotografia do cliente é o assunto, o overlay é camada.
 * - **Chamadas ortogonais e curtas.** Nada de pontilhado diagonal atravessando
 *   o quarto inteiro. Sai do texto na horizontal, dobra uma vez, chega no alvo.
 * - **Tipografia relativa.** Todo tamanho é fração do lado menor do quadro, então
 *   o mesmo layout serve 1K e 2K, retrato e paisagem.
 * - **Cor só no técnico.** As quatro cores de infraestrutura são a única cor do
 *   desenho; todo o resto é branco em três opacidades.
 */

type Ponto = { x: number; y: number };
type Caixa = { cx: number; cy: number; w: number; h: number };
type Retangulo = { x: number; y: number; w: number; h: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ---------------------------------------------------------------------------
// Traços
// ---------------------------------------------------------------------------

/**
 * Linha de chamada em L: sai na horizontal, dobra uma vez, chega no alvo.
 *
 * A diagonal pontilhada da V1 cruzava a cena inteira e competia com a
 * fotografia. Duas retas ortogonais leem como desenho técnico e ocupam só a
 * borda do quadro.
 */
function chamadaOrtogonal(de: Ponto, para: Ponto, maxComprimento: number): string {
  const comprimento = Math.abs(para.x - de.x) + Math.abs(para.y - de.y);
  // Chamada longa demais deixa de orientar e vira risco na foto; nesse caso o
  // callout fica sem linha e se explica pela proximidade.
  if (comprimento > maxComprimento) return "";
  const d = `M ${de.x.toFixed(1)} ${de.y.toFixed(1)} L ${para.x.toFixed(1)} ${de.y.toFixed(1)} L ${para.x.toFixed(1)} ${para.y.toFixed(1)}`;
  return (
    `<path d="${d}" fill="none" stroke="${V2_TRACO}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${para.x.toFixed(1)}" cy="${para.y.toFixed(1)}" r="2.6" fill="${V2_TRACO_FORTE}"/>`
  );
}

/** Cota vertical com serifas nas pontas, no estilo de desenho técnico. */
function cotaVertical(x: number, y1: number, y2: number, meiaSerifa: number): string {
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${V2_TRACO_FORTE}" stroke-width="1.1"/>` +
    `<line x1="${x - meiaSerifa}" y1="${y1}" x2="${x + meiaSerifa}" y2="${y1}" stroke="${V2_TRACO_FORTE}" stroke-width="1.1"/>` +
    `<line x1="${x - meiaSerifa}" y1="${y2}" x2="${x + meiaSerifa}" y2="${y2}" stroke="${V2_TRACO_FORTE}" stroke-width="1.1"/>`
  );
}

// ---------------------------------------------------------------------------
// Raio-X do forro
// ---------------------------------------------------------------------------

/**
 * Corte técnico do forro: linha do forro, corpo da evaporadora escondido no
 * plenum e a cota do vão.
 *
 * O corpo é estilizado de propósito. A foto do produto mostra o painel visto de
 * baixo, e não existe informação nenhuma sobre como o corpo dele aparece de lado
 * nesta cena — desenhar um retrato falso seria pior que uma silhueta honesta.
 *
 * Nunca pedir isso ao Gemini: ele desenha o corpo em posição diferente a cada
 * geração, e o resultado colide com a cota que o compositor desenha depois.
 */
function corteDoForro(caixa: Caixa, topoUtil: number): { svg: string; topo: number; ocupa: Retangulo } | null {
  const alturaDisponivel = caixa.cy - caixa.h / 2 - topoUtil;
  // Sem vão suficiente entre o topo do quadro e o painel, o corte sairia
  // cortado pela borda — melhor não desenhar do que desenhar pela metade.
  // Meia altura do painel já basta: um corpo baixo ainda comunica "existe um
  // volume escondido aqui em cima", e é melhor que não desenhar nada. Exigir a
  // altura cheia deixava sem raio-X justamente as marcações mais comuns, com o
  // cassete perto do topo do quadro.
  if (alturaDisponivel < caixa.h * 0.5) return null;

  const alturaCorpo = Math.min(caixa.h * 2.1, alturaDisponivel * 0.78);
  const larguraCorpo = caixa.w * 0.78;
  const baseCorpo = caixa.cy - caixa.h / 2 - caixa.h * 0.3;
  const topoCorpo = baseCorpo - alturaCorpo;
  const x = caixa.cx - larguraCorpo / 2;

  const nervuras = Array.from({ length: 4 }, (_, i) => {
    const nx = x + (larguraCorpo * (i + 1)) / 5;
    return `<line x1="${nx.toFixed(1)}" y1="${(topoCorpo + alturaCorpo * 0.16).toFixed(1)}" x2="${nx.toFixed(1)}" y2="${(topoCorpo + alturaCorpo * 0.84).toFixed(1)}" stroke="rgba(255,255,255,0.20)" stroke-width="0.9"/>`;
  }).join("");

  // Linha do forro: atravessa a largura do aparelho com folga para os dois
  // lados, marcando o plano onde o painel encosta.
  const linhaForro = `<line x1="${(caixa.cx - caixa.w * 1.05).toFixed(1)}" y1="${(caixa.cy - caixa.h / 2).toFixed(1)}" x2="${(caixa.cx + caixa.w * 1.05).toFixed(1)}" y2="${(caixa.cy - caixa.h / 2).toFixed(1)}" stroke="rgba(255,255,255,0.34)" stroke-width="1"/>`;

  const tirante = Math.min(caixa.h * 0.8, topoCorpo - topoUtil);
  const tirantes =
    tirante > 4
      ? `<line x1="${(x + larguraCorpo * 0.16).toFixed(1)}" y1="${topoCorpo.toFixed(1)}" x2="${(x + larguraCorpo * 0.16).toFixed(1)}" y2="${(topoCorpo - tirante).toFixed(1)}" stroke="rgba(255,255,255,0.30)" stroke-width="0.9"/>` +
        `<line x1="${(x + larguraCorpo * 0.84).toFixed(1)}" y1="${topoCorpo.toFixed(1)}" x2="${(x + larguraCorpo * 0.84).toFixed(1)}" y2="${(topoCorpo - tirante).toFixed(1)}" stroke="rgba(255,255,255,0.30)" stroke-width="0.9"/>`
      : "";

  const corpo =
    `<rect x="${x.toFixed(1)}" y="${topoCorpo.toFixed(1)}" width="${larguraCorpo.toFixed(1)}" height="${alturaCorpo.toFixed(1)}" rx="2.5" ` +
    `fill="rgba(226,236,248,0.10)" stroke="rgba(255,255,255,0.42)" stroke-width="1"/>`;

  return {
    svg: linhaForro + tirantes + corpo + nervuras,
    topo: topoCorpo,
    // Largura real do corpo desenhado, não a da caixa marcada: reservar demais
    // empurrava o callout "FORRO ATÉ LAJE" da faixa superior para o meio da
    // fotografia, e a chamada dele passava a atravessar a cena.
    // Exatamente a largura do corpo, sem folga: o corte é translúcido e
    // discreto, e reservar margem em volta dele empurrava o callout da faixa
    // superior para o meio da fotografia.
    ocupa: { x: caixa.cx - larguraCorpo / 2, y: topoCorpo - tirante, w: larguraCorpo, h: baseCorpo - topoCorpo + tirante },
  };
}

// ---------------------------------------------------------------------------
// Fluxo de ar volumétrico
// ---------------------------------------------------------------------------

/**
 * Quatro plumas de ar em curva, muito claras.
 *
 * A V1 usava pétalas com entalhe em V — leem como seta, e seta é sinalização,
 * não ar. Aqui cada pluma é uma faixa curva com gradiente que desaparece, o que
 * lê como volume de ar saindo do painel sem dominar a fotografia.
 *
 * O desfoque é feito por camadas sobrepostas em vez de `feGaussianBlur`: este
 * SVG é rasterizado dentro de outro SVG, e filtro aninhado é justamente o que
 * este pipeline não garante.
 */
function fluxoVolumetrico(caixa: Caixa, escala: number): string {
  const origem: Ponto = { x: caixa.cx, y: caixa.cy + caixa.h * 0.45 };
  const alcance = caixa.w * 0.95;
  const partes: string[] = [
    `<radialGradient id="v2ar" gradientUnits="userSpaceOnUse" cx="${origem.x}" cy="${origem.y}" r="${alcance}">` +
      `<stop offset="0%" stop-color="#DCEBFF" stop-opacity="0.30"/>` +
      `<stop offset="60%" stop-color="#DCEBFF" stop-opacity="0.12"/>` +
      `<stop offset="100%" stop-color="#DCEBFF" stop-opacity="0"/>` +
      `</radialGradient>`,
  ];

  // Quatro vias: dois pares simétricos, abrindo em curva. Cada pluma é
  // desenhada três vezes com espessura decrescente — é o que substitui o blur.
  for (const lado of [-1, 1] as const) {
    for (const abertura of [0.42, 0.92] as const) {
      const fim: Ponto = { x: origem.x + lado * alcance * abertura, y: origem.y + alcance * 0.52 };
      const controle: Ponto = { x: origem.x + lado * alcance * abertura * 0.35, y: origem.y + alcance * 0.46 };
      const d = `M ${origem.x.toFixed(1)} ${origem.y.toFixed(1)} Q ${controle.x.toFixed(1)} ${controle.y.toFixed(1)} ${fim.x.toFixed(1)} ${fim.y.toFixed(1)}`;
      for (const [espessura, opacidade] of [
        [13 * escala, 0.10],
        [7 * escala, 0.14],
        [3 * escala, 0.20],
      ] as const) {
        partes.push(
          `<path d="${d}" fill="none" stroke="#DCEBFF" stroke-opacity="${opacidade}" stroke-width="${espessura.toFixed(1)}" stroke-linecap="round"/>`
        );
      }
    }
  }

  partes.push(
    `<ellipse cx="${origem.x.toFixed(1)}" cy="${(origem.y + alcance * 0.22).toFixed(1)}" rx="${(alcance * 0.85).toFixed(1)}" ry="${(alcance * 0.34).toFixed(1)}" fill="url(#v2ar)"/>`
  );
  return partes.join("");
}

// ---------------------------------------------------------------------------
// Feixe de infraestrutura
// ---------------------------------------------------------------------------

function polilinhaDeslocada(pontos: Ponto[], offset: number): string {
  if (pontos.length < 2) return "";
  const normais = pontos.map((_, i) => {
    const anterior = pontos[Math.max(0, i - 1)];
    const seguinte = pontos[Math.min(pontos.length - 1, i + 1)];
    const dx = seguinte.x - anterior.x;
    const dy = seguinte.y - anterior.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
  return (
    "M " +
    pontos.map((p, i) => `${(p.x + normais[i].x * offset).toFixed(1)} ${(p.y + normais[i].y * offset).toFixed(1)}`).join(" L ")
  );
}

/**
 * Faixa translúcida acompanhando a rota: o vão do forro por onde a
 * infraestrutura corre.
 *
 * Sem ela, o feixe colorido parecia quatro fios pendurados no ar no meio da
 * sala. A faixa é o raio-X do caminho — diz que aquilo passa ACIMA do forro, e
 * não à vista. É desenhada antes do feixe, embaixo dele.
 */
function faixaPlenum(pontos: Ponto[], largura: number): string {
  if (pontos.length < 2) return "";
  const superior = polilinhaDeslocada(pontos, -largura / 2);
  const inferior = polilinhaDeslocada(pontos, largura / 2);
  if (!superior || !inferior) return "";
  // O contorno é a borda de cima seguida da de baixo ao contrário — fecha a
  // faixa como um polígono só, sem costura visível nas curvas.
  const voltaInferior = "L " + inferior.replace(/^M /, "").split(" L ").reverse().join(" L ");
  return (
    `<path d="${superior} ${voltaInferior} Z" fill="rgba(226,236,248,0.13)"/>` +
    `<path d="${superior}" fill="none" stroke="rgba(255,255,255,0.40)" stroke-width="1" stroke-dasharray="6 4"/>` +
    `<path d="${inferior}" fill="none" stroke="rgba(255,255,255,0.40)" stroke-width="1" stroke-dasharray="6 4"/>`
  );
}

/** As quatro linhas com espaçamento constante, nas MESMAS cores da legenda —
 *  os dois lados leem `INFRA`, então não há como uma mudar sem a outra. */
function feixeInfra(pontos: Ponto[], escala: number): string {
  const largura = Math.max(1.8, escala * 2.6);
  const passo = largura * 1.7;
  const offsets = [-1.5, -0.5, 0.5, 1.5].map((k) => k * passo);
  return ORDEM_INFRA.map((chave, i) => {
    const spec = INFRA[chave];
    const d = polilinhaDeslocada(pontos, offsets[i]);
    if (!d) return "";
    const tracejado = "tracejado" in spec && spec.tracejado ? ` stroke-dasharray="${largura * 3} ${largura * 2}"` : "";
    return (
      `<path d="${d}" fill="none" stroke="rgba(6,10,18,0.35)" stroke-width="${largura + 1.4}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="${spec.cor}" stroke-width="${largura}" stroke-linecap="round" stroke-linejoin="round"${tracejado}/>`
    );
  }).join("");
}

// ---------------------------------------------------------------------------
// Nós de texto
// ---------------------------------------------------------------------------

type Callout = { x: number; y: number; w: number; titulo: string; corpo: string | null; alvo: Ponto | null };

function calloutNo(c: Callout, lado: number): No {
  const sombra = "0 1px 3px rgba(0,0,0,0.85), 0 0 10px rgba(0,0,0,0.55)";
  return el(
    "div",
    {
      position: "absolute",
      left: c.x - lado * 0.012,
      top: c.y - lado * 0.009,
      width: c.w + lado * 0.024,
      flexDirection: "column",
      // Véu discreto atrás do texto solto.
      //
      // Sombra sozinha não resolve texto branco sobre cortina clara ou parede
      // branca — e é exatamente onde os callouts caem numa foto de sala. O véu
      // é fraco o bastante para a fotografia continuar visível através dele, e
      // é o que dá ao bloco de texto a borda que o organiza na página.
      background: "rgba(8,14,24,0.34)",
      borderRadius: V2_RAIO * 0.7,
      padding: `${Math.round(lado * 0.009)}px ${Math.round(lado * 0.012)}px`,
    },
    el(
      "div",
      {
        fontSize: V2_TIPO.rotulo * lado,
        fontWeight: 600,
        color: V2_TEXTO,
        letterSpacing: 0.9,
        textShadow: sombra,
        lineHeight: 1.25,
      },
      c.titulo
    ),
    c.corpo
      ? el(
          "div",
          {
            fontSize: V2_TIPO.texto * lado,
            color: V2_TEXTO_SUAVE,
            marginTop: 3,
            lineHeight: 1.4,
            width: c.w,
            textShadow: sombra,
          },
          c.corpo
        )
      : null
  );
}

function cartaoVidro(x: number, y: number, w: number, lado: number, ...filhos: (No | null | false)[]): No {
  return el(
    "div",
    {
      position: "absolute",
      left: x,
      top: y,
      width: w,
      flexDirection: "column",
      background: V2_VIDRO,
      border: `1px solid ${V2_VIDRO_BORDA}`,
      borderRadius: V2_RAIO,
      padding: `${Math.round(lado * 0.014)}px ${Math.round(lado * 0.016)}px`,
    },
    ...filhos
  );
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

export type PlanoV2 = { linhas: string; nos: No[] };

export function planoCassetteCommercialV2(
  d: DadosOverlay,
  m: Marcacao,
  W: number,
  H: number,
  qrDataUrl: string | null
): PlanoV2 {
  const lado = Math.min(W, H);
  const escala = lado / 1024;
  const diagonal = Math.hypot(W, H);
  const Z = V2_ZONAS_CASSETE;

  const caixa: Caixa = {
    cx: (m.caixa.x + m.caixa.w / 2) * W,
    cy: (m.caixa.y + m.caixa.h / 2) * H,
    w: m.caixa.w * W,
    h: m.caixa.h * H,
  };

  const linhas: string[] = [];
  const nos: No[] = [];
  const ocupados: Retangulo[] = [];
  const colide = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /** Zona preferencial primeiro; só desliza para baixo se estiver ocupada. */
  const alocar = (zona: { x: number; y: number; w: number }, alturaEstimada: number): { x: number; y: number } | null => {
    const largura = zona.w * W;
    for (let passo = 0; passo < 8; passo++) {
      const r = { x: zona.x * W, y: zona.y * H + passo * alturaEstimada * 1.15, w: largura, h: alturaEstimada };
      if (r.y + r.h > H * 0.96) break;
      if (!ocupados.some((o) => colide(r, o))) {
        ocupados.push(r);
        return { x: r.x, y: r.y };
      }
    }
    return null;
  };

  const alturaTexto = (titulo: string, corpo: string | null, largura: number) => {
    const porLinha = Math.max(10, largura / (V2_TIPO.texto * lado * 0.55));
    const linhasTitulo = Math.max(1, Math.ceil(titulo.length / Math.max(8, largura / (V2_TIPO.rotulo * lado * 0.6))));
    const linhasCorpo = corpo ? Math.ceil(corpo.length / porLinha) : 0;
    return linhasTitulo * V2_TIPO.rotulo * lado * 1.35 + linhasCorpo * V2_TIPO.texto * lado * 1.45 + lado * 0.012;
  };

  const empurrar = (zona: { x: number; y: number; w: number }, titulo: string, corpo: string | null, alvo: Ponto | null) => {
    const largura = zona.w * W;
    const altura = alturaTexto(titulo, corpo, largura);
    const pos = alocar(zona, altura);
    if (!pos) return;
    const c: Callout = { x: pos.x, y: pos.y, w: largura, titulo, corpo, alvo };
    nos.push(calloutNo(c, lado));
    if (alvo) {
      // Sai da borda do texto voltada para o alvo, na altura do título.
      const saida: Ponto = { x: alvo.x > pos.x + largura / 2 ? pos.x + largura : pos.x, y: pos.y + V2_TIPO.rotulo * lado * 0.6 };
      linhas.push(chamadaOrtogonal(saida, alvo, diagonal * V2_CHAMADA_MAX_DIAGONAL));
    }
  };

  // --- Cena: raio-X, fluxo e infraestrutura ---------------------------------
  // O corte é central e o selo "Design created by ARCIL AI" é colado no canto
  // superior DIREITO, então o corte pode subir bem mais que os callouts.
  const topoUtil = H * 0.03;
  const corte = corteDoForro(caixa, topoUtil);
  if (corte) {
    linhas.push(corte.svg);
    ocupados.push(corte.ocupa);
    // Cota do plenum, colada na borda esquerda do corpo.
    const xCota = clamp(caixa.cx - caixa.w * 0.52, W * 0.04, W * 0.96);
    linhas.push(cotaVertical(xCota, corte.topo, caixa.cy - caixa.h / 2, lado * 0.008));
    nos.push(
      el(
        "div",
        {
          position: "absolute",
          left: xCota + lado * 0.012,
          top: (corte.topo + caixa.cy - caixa.h / 2) / 2 - V2_TIPO.medida * lado * 0.6,
          fontSize: V2_TIPO.medida * lado,
          fontWeight: 600,
          color: V2_TEXTO,
          textShadow: "0 1px 3px rgba(0,0,0,0.85)",
        },
        d.distanciaTeto
      )
    );
  }

  linhas.push(fluxoVolumetrico(caixa, escala));
  // Reserva só o que o leque realmente ocupa, abaixo do painel. A versão
  // anterior reservava também o espaço ACIMA do aparelho e empurrava a legenda
  // da faixa superior para o meio da imagem.
  ocupados.push({ x: caixa.cx - caixa.w * 0.95, y: caixa.cy + caixa.h * 0.3, w: caixa.w * 1.9, h: caixa.w * 0.95 });

  const rotaMarcada: Ponto[] =
    m.rota.length >= 2
      ? m.rota.map((p: PontoFrac) => ({ x: p.x * W, y: p.y * H }))
      : [
          { x: caixa.cx + caixa.w * 0.5, y: caixa.cy - caixa.h * 0.2 },
          { x: caixa.cx + caixa.w * 1.6, y: caixa.cy - caixa.h * 0.6 },
        ];

  // A rota do vendedor começa onde o dedo encostou, que raramente é a borda do
  // aparelho — o feixe ficava boiando a alguns centímetros dele, como fio solto
  // no ar. Prefixar o ponto da borda mais próxima liga o desenho ao painel.
  // Entra um pouco DENTRO da caixa, não na borda dela: o aparelho que o modelo
  // desenha costuma sair menor que o retângulo marcado, e ancorar na borda
  // deixava o feixe começando a alguns centímetros do painel, boiando no ar.
  const inicio = rotaMarcada[0];
  const bordaX = clamp(inicio.x, caixa.cx - caixa.w * 0.35, caixa.cx + caixa.w * 0.35);
  const bordaY = clamp(inicio.y, caixa.cy - caixa.h * 0.35, caixa.cy + caixa.h * 0.35);
  const rota: Ponto[] = [{ x: bordaX, y: bordaY }, ...rotaMarcada];
  // Para antes da LEGENDA, não antes do card da área externa: a legenda começa
  // bem mais à esquerda, e era ela que o feixe estava atravessando — as quatro
  // linhas passando por cima dos quatro rótulos que as explicam.
  const limiteDireita = Z.infraestrutura.x * W - W * 0.025;
  const rotaVisivel = rota.filter((p, i) => i === 0 || p.x <= limiteDireita);
  const rotaFinal = rotaVisivel.length >= 2 ? rotaVisivel : rota.slice(0, 2);
  // No modo `gemini_3d` o modelo já desenhou a tubulação na cena, em volume e
  // com sombra. Desenhar o feixe vetorial por cima colocaria a MESMA
  // informação duas vezes, em duas linguagens diferentes e nunca no mesmo
  // lugar — é o erro que este projeto já pagou uma vez.
  const desenhaFeixe = !tubulacaoPeloModelo(d.modoInfra);
  if (desenhaFeixe) {
    const larguraFeixe = Math.max(1.8, escala * 2.6) * 1.7 * 4;
    linhas.push(faixaPlenum(rotaFinal, larguraFeixe * 1.9));
    linhas.push(feixeInfra(rotaFinal, escala));
  }

  // --- Callouts da faixa superior -------------------------------------------
  empurrar(Z.evaporadora, "EVAPORADORA CASSETE", "Instalação embutida no forro, com distribuição de ar em 4 vias.", {
    x: caixa.cx - caixa.w * 0.45,
    y: caixa.cy,
  });

  empurrar(Z.forroLaje, "FORRO ATÉ LAJE", "Espaço técnico para a unidade e a infraestrutura.", corte ? { x: caixa.cx, y: corte.topo + (caixa.cy - caixa.h / 2 - corte.topo) / 2 } : null);

  // Legenda das quatro cores: só faz sentido explicando um feixe que nós
  // desenhamos. Com a tubulação vinda do modelo em cobre e conduíte reais, uma
  // legenda de cores não corresponde a nada na imagem.
  if (desenhaFeixe) {
    const largura = Z.infraestrutura.w * W;
    const altura = lado * 0.135;
    const pos = alocar(Z.infraestrutura, altura);
    if (pos) {
      nos.push(
        el(
          "div",
          { position: "absolute", left: pos.x, top: pos.y, width: largura, flexDirection: "column" },
          el(
            "div",
            {
              fontSize: V2_TIPO.rotulo * lado,
              fontWeight: 600,
              color: V2_TEXTO,
              letterSpacing: 0.9,
              marginBottom: lado * 0.009,
              textShadow: "0 1px 3px rgba(0,0,0,0.85)",
            },
            "INFRAESTRUTURA FRIGORÍGENA"
          ),
          ...ORDEM_INFRA.map((chave) => {
            const spec = INFRA[chave];
            const tracejado = "tracejado" in spec && spec.tracejado;
            return el(
              "div",
              { alignItems: "center", marginBottom: lado * 0.005 },
              tracejado
                ? el(
                    "div",
                    { width: lado * 0.026, alignItems: "center", marginRight: lado * 0.009, flexShrink: 0 },
                    ...[0, 1, 2].map(() =>
                      el("div", { width: lado * 0.006, height: lado * 0.0028, borderRadius: 2, background: spec.cor, marginRight: lado * 0.003 })
                    )
                  )
                : el("div", { width: lado * 0.026, height: lado * 0.0028, borderRadius: 2, background: spec.cor, marginRight: lado * 0.009, flexShrink: 0 }),
              el("div", { fontSize: V2_TIPO.texto * lado, color: V2_TEXTO_SUAVE, textShadow: "0 1px 3px rgba(0,0,0,0.85)" }, spec.rotulo)
            );
          })
        )
      );
    }
  }

  // --- Ligação até a condensadora -------------------------------------------
  const fimRota = rotaVisivel[rotaVisivel.length - 1] ?? rota[rota.length - 1];
  empurrar(
    Z.ligacao,
    "LIGAÇÃO ATÉ CONDENSADORA",
    d.unidadeExterna ? `Caminho da infraestrutura até a unidade externa: ${d.unidadeExterna}.` : "Caminho da infraestrutura até a unidade externa.",
    { x: clamp(fimRota.x, W * 0.04, W * 0.96), y: clamp(fimRota.y, topoUtil, H * 0.9) }
  );

  // --- Fluxo de ar -----------------------------------------------------------
  empurrar(Z.fluxo, "FLUXO DE AR", "Distribuição uniforme nos 4 sentidos.", null);

  // Sem a legenda de cores, a natureza do que corre no caminho precisa ser dita
  // em palavras — senão a prévia mostra um tubo e não diz o que vai dentro.
  if (!desenhaFeixe) {
    empurrar(
      Z.infraestrutura,
      "INFRAESTRUTURA FRIGORÍGENA",
      "Tubulação de cobre isolada (ida e retorno), cabo elétrico e dreno com inclinação contínua.",
      null
    );
  }

  // --- Cards -----------------------------------------------------------------
  const sombraCard = "0 1px 2px rgba(0,0,0,0.6)";

  // Área técnica externa: a foto do ERP é do CONJUNTO (evaporadora, condensadora
  // e controle numa imagem só), então o título fala em equipamento, não em
  // unidade externa — senão o card promete uma coisa e mostra outra.
  if (d.produtoImagemBase64) {
    const largura = Z.areaExterna.w * W;
    nos.push(
      cartaoVidro(
        Z.areaExterna.x * W,
        Z.areaExterna.y * H,
        largura,
        lado,
        el(
          "div",
          { fontSize: V2_TIPO.tituloCard * lado, fontWeight: 600, color: V2_TEXTO, letterSpacing: 0.8, textShadow: sombraCard },
          "ÁREA TÉCNICA EXTERNA"
        ),
        el("div", { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_FRACO, marginTop: 1 }, "(ILUSTRATIVO)"),
        img(d.produtoImagemBase64, {
          width: largura - lado * 0.032,
          height: (largura - lado * 0.032) * 0.62,
          objectFit: "contain",
          marginTop: lado * 0.01,
        }),
        el(
          "div",
          { fontSize: V2_TIPO.textoCard * lado, color: V2_TEXTO_SUAVE, marginTop: lado * 0.009, lineHeight: 1.35, width: largura - lado * 0.032 },
          d.unidadeExterna ? `Local previsto: ${d.unidadeExterna}.` : "Local a confirmar."
        ),
        d.nivelCondensadora
          ? el("div", { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_FRACO, marginTop: 2 }, `Nível: ${d.nivelCondensadora.toLowerCase()}.`)
          : null
      )
    );
    ocupados.push({ x: Z.areaExterna.x * W, y: Z.areaExterna.y * H, w: largura, h: H * 0.42 });
  }

  // Card MODELO
  {
    const largura = Z.modelo.w * W;
    const marca = (d.marca ?? "").trim();
    const nome = d.produto.trim();
    const linhaProduto = marca && !nome.toUpperCase().startsWith(marca.toUpperCase()) ? `${marca} ${nome}` : nome;
    nos.push(
      cartaoVidro(
        Z.modelo.x * W,
        Z.modelo.y * H,
        largura,
        lado,
        el("div", { fontSize: V2_TIPO.tituloCard * lado, fontWeight: 600, color: V2_TEXTO, letterSpacing: 0.8, textShadow: sombraCard }, "MODELO:"),
        el(
          "div",
          { fontSize: V2_TIPO.textoCard * lado, color: V2_TEXTO_SUAVE, marginTop: 4, lineHeight: 1.38, width: largura - lado * 0.032 },
          linhaProduto
        ),
        d.capacidade || d.sku
          ? el(
              "div",
              { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_FRACO, marginTop: 3 },
              [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · ")
            )
          : null
      )
    );
    ocupados.push({ x: Z.modelo.x * W, y: Z.modelo.y * H, w: largura, h: H * 0.14 });
  }

  // Checklist — no máximo 5 itens, e a fonte declarada. A prévia não pode
  // afirmar condição de garantia de fabricante sem manual cadastrado.
  {
    const largura = Z.checklist.w * W;
    const itens = d.recomendacoesGarantia.slice(0, 5);
    if (itens.length) {
      nos.push(
        cartaoVidro(
          Z.checklist.x * W,
          Z.checklist.y * H,
          largura,
          lado,
          el(
            "div",
            { fontSize: V2_TIPO.tituloCard * lado, fontWeight: 600, color: V2_TEXTO, letterSpacing: 0.8, marginBottom: lado * 0.008, textShadow: sombraCard },
            "PONTOS CRÍTICOS DA INSTALAÇÃO"
          ),
          ...itens.map((texto) =>
            el(
              "div",
              { alignItems: "flex-start", marginBottom: lado * 0.005 },
              el("div", {
                width: lado * 0.005,
                height: lado * 0.005,
                borderRadius: lado * 0.005,
                background: V2_TEXTO_SUAVE,
                marginRight: lado * 0.009,
                marginTop: lado * 0.007,
                flexShrink: 0,
              }),
              el("div", { fontSize: V2_TIPO.textoCard * lado, color: V2_TEXTO_SUAVE, lineHeight: 1.35, flex: 1 }, texto)
            )
          ),
          el(
            "div",
            { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_FRACO, marginTop: lado * 0.008 },
            "Fonte: ABNT NBR 16655/5410 e prática geral de instalação."
          )
        )
      );
    }
  }

  // Selo de aprovação
  {
    const largura = Z.aprovacao.w * W;
    nos.push(
      el(
        "div",
        { position: "absolute", left: Z.aprovacao.x * W, top: Z.aprovacao.y * H, width: largura, flexDirection: "column" },
        el(
          "div",
          { fontSize: V2_TIPO.textoCard * lado, fontWeight: 600, color: V2_TEXTO, letterSpacing: 0.7, textShadow: "0 1px 3px rgba(0,0,0,0.85)" },
          SELO_APROVACAO.titulo
        ),
        el(
          "div",
          { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_FRACO, marginTop: 2, textShadow: "0 1px 3px rgba(0,0,0,0.85)" },
          SELO_APROVACAO.corpo
        )
      )
    );
  }

  // Logo: assinatura arquitetônica, sem card em volta.
  {
    const src = logoArcil();
    if (src) {
      const largura = W * 0.115;
      nos.push(
        el(
          "div",
          { position: "absolute", left: Z.logo.x * W, top: Z.logo.y * H, opacity: 0.88 },
          img(src, { width: largura, height: largura * 0.28, objectFit: "contain" })
        )
      );
    }
  }

  // QR
  if (qrDataUrl) {
    const ladoQr = W * 0.05;
    nos.push(
      el(
        "div",
        { position: "absolute", left: Z.qr.x * W, top: Z.qr.y * H, alignItems: "center" },
        el(
          "div",
          { flexDirection: "column", alignItems: "flex-end", marginRight: lado * 0.01 },
          el("div", { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_SUAVE, textAlign: "right", lineHeight: 1.3, textShadow: "0 1px 3px rgba(0,0,0,0.85)" }, "Escaneie para"),
          // O rótulo segue o destino real do QR. Prometer "manual" e abrir a
          // imagem da prévia queima a confiança do cliente na frente do
          // vendedor.
          el(
            "div",
            { fontSize: V2_TIPO.micro * lado, color: V2_TEXTO_SUAVE, textAlign: "right", lineHeight: 1.3, textShadow: "0 1px 3px rgba(0,0,0,0.85)" },
            d.qrEhManual ? "acessar o manual" : "abrir esta prévia"
          )
        ),
        img(qrDataUrl, { width: ladoQr, height: ladoQr, borderRadius: 4 })
      )
    );
  }

  // Rodapé legal
  nos.push(
    el(
      "div",
      { position: "absolute", left: W * 0.16, top: H - H * 0.042, width: W * 0.5 },
      el("div", { fontSize: V2_TIPO.micro * lado * 0.86, color: V2_TEXTO_FRACO, lineHeight: 1.3 }, RODAPE_LEGAL)
    )
  );

  return { linhas: linhas.join(""), nos };
}

/** Envelope SVG das linhas, pronto para virar `<img>` na árvore do compositor. */
export function svgV2(linhas: string, W: number, H: number): string {
  return b64svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${linhas}</svg>`);
}
