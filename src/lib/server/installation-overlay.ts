import satori from "satori";
import sharp from "sharp";
import QRCode from "qrcode";
import { el, img, b64svg, fontes, logoArcil, type No } from "./satori-nodes";
import { esquemaInstalacao, esquemaCondensadora, ESQUEMA_W, ESQUEMA_H, ESQUEMA_COND_H } from "./install-schematic";
import { planoAnotacoes, legendaInfraNo, painelCondensadoraNo, svgDasLinhas } from "./preview-annotations";
import type { DadosOverlay } from "./previa-tipos";
import {
  AZUL,
  CLARO,
  CINZA,
  CARD_FUNDO,
  CARD_BORDA,
  CARD_RAIO,
  SOMBRA_TEXTO,
  SOMBRA_TITULO,
  FAIXA,
  RODAPE_LEGAL,
  SELO_APROVACAO,
} from "@/constants/arcil-brand";

import { planoCassetteCommercialV2, svgV2 } from "./layouts/cassette-commercial-layout";
import { V2_CASSETTE_LAYOUT } from "@/lib/env";

export type { DadosOverlay } from "./previa-tipos";

/**
 * Compõe a camada técnica sobre a cena gerada pelo modelo de imagem.
 *
 * Por que existir: pedir título, cotas, passo a passo e cards a um modelo de
 * imagem é pedir justamente a coisa que ele menos sabe fazer. Já saiu "2,80m"
 * onde o vendedor respondeu 2,70, e uma legenda escrita "FLOXO DE AR" colada no
 * teto. Aqui o modelo desenha só a cena (ambiente + aparelho instalado) e o
 * texto vem vetorial, sempre nítido e sempre com o número que está no banco.
 *
 * Existem DOIS layouts, e qual sai depende de o vendedor ter marcado a foto:
 *
 * - **ancorado** (`d.marcacao` presente): callouts com linha de chamada presos
 *   ao aparelho, rota da infraestrutura colorida, cotas, fluxo de ar, painel da
 *   condensadora e cards de canto. É o padrão visual aprovado. Só é possível
 *   porque a posição vem do retângulo que o vendedor arrastou — a versão
 *   anterior disto foi desligada justamente por depender de uma âncora
 *   adivinhada por IA de visão.
 * - **cards** (sem marcação): título no topo e quatro cards no rodapé, que não
 *   dependem de saber onde o aparelho está na cena. É o comportamento que
 *   existia antes desta feature e continua sendo a saída de quem pula a
 *   marcação.
 */

const BORDA = CARD_BORDA;

// Ícones de linha simples trocando o número solto do passo a passo e o "·" da
// garantia por algo que se lê rápido no card.
const TRACO = { fill: "none", stroke: AZUL, "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
const attrs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");
const ICONE_MEDIR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="1.5" ${attrs(TRACO)}/><path d="M7 9v3M11 9v2M15 9v3M19 9v2" ${attrs(TRACO)}/></svg>`;
const ICONE_FURAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 12h10l4-3.5v7L13 12" ${attrs(TRACO)}/><path d="M17 8.5v7" ${attrs(TRACO)}/></svg>`;
const ICONE_TUBULACAO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 8h9a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h7" ${attrs(TRACO)}/></svg>`;
const ICONE_GABINETE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="1.5" ${attrs(TRACO)}/><path d="M4 11.5h16" ${attrs(TRACO)}/></svg>`;
const ICONE_TESTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" ${attrs(TRACO)}/><path d="M12 13 15 9" ${attrs(TRACO)}/><path d="M12 4v2" ${attrs(TRACO)}/></svg>`;
const ICONE_GOTA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3C12 3 6 11 6 15.2a6 6 0 0 0 12 0C18 11 12 3 12 3Z" ${attrs(TRACO)}/></svg>`;
const ICONE_RAIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" ${attrs(TRACO)}/></svg>`;
const ICONE_VEDACAO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" ${attrs(TRACO)}/><path d="M8 12h8" ${attrs(TRACO)}/></svg>`;
// "✓" (U+2713) não existe na Montserrat e saía como quadradinho de glifo
// ausente — o check vem desenhado, não como caractere.
const ICONE_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6" ${attrs(TRACO)}/></svg>`;

const ICONES_PASSO = [ICONE_MEDIR, ICONE_FURAR, ICONE_TUBULACAO, ICONE_GABINETE, ICONE_TESTE];

const PASSOS_PADRAO = [
  "Marcar e nivelar o suporte na parede",
  "Furar com leve caimento para fora",
  "Passar tubulação de cobre, dreno e cabo",
  "Fixar a unidade interna e conferir encaixe",
  "Testar drenagem, vedação e funcionamento",
];

// A sequência de passos do hi-wall ("furar a parede", "suporte na parede") é
// fisicamente errada para os outros formatos — cassete e dutado vão no forro,
// janela não tem suporte de parede nenhum. Isso não é estilo, é o passo a
// passo mostrando a obra errada para quem vai instalar.
const PASSOS_POR_TIPO: Record<string, string[]> = {
  cassete: [
    "Marcar e nivelar o gabinete no forro",
    "Abrir o vão e fixar os tirantes na laje",
    "Passar tubulação de cobre, dreno (com bomba, se necessário) e cabo",
    "Encaixar o gabinete e o painel decorativo",
    "Testar drenagem, vedação e funcionamento",
  ],
  "piso-teto": [
    "Marcar e nivelar o suporte no piso ou no teto",
    "Fixar os suportes na superfície escolhida",
    "Passar tubulação de cobre, dreno e cabo",
    "Fixar a unidade interna e conferir encaixe",
    "Testar drenagem, vedação e funcionamento",
  ],
  dutado: [
    "Fixar a unidade no espaço técnico com amortecedores",
    "Montar a rede de dutos, retorno e grelhas",
    "Passar tubulação de cobre, dreno e cabo",
    "Isolar termicamente dutos e conexões",
    "Testar drenagem, vedação e funcionamento",
  ],
  janela: [
    "Conferir e preparar o vão da janela ou parede",
    "Instalar o suporte e a base de sustentação",
    "Encaixar a unidade e vedar as laterais",
    "Ligar ao ponto elétrico exclusivo",
    "Testar vedação e funcionamento",
  ],
};

function passosPara(tipoEquipamento: string): string[] {
  return PASSOS_POR_TIPO[tipoEquipamento.trim().toLowerCase()] ?? PASSOS_PADRAO;
}

function iconeGarantiaPara(texto: string): string {
  const t = texto.toLowerCase();
  if (/tubulaç|cobre/.test(t)) return ICONE_TUBULACAO;
  if (/vácuo|vacuo|estanqueidade|teste/.test(t)) return ICONE_TESTE;
  if (/dreno|drenagem|caimento/.test(t)) return ICONE_GOTA;
  if (/elétric|eletric|aterr/.test(t)) return ICONE_RAIO;
  if (/vedaç|aletas|frestas/.test(t)) return ICONE_VEDACAO;
  return ICONE_TESTE;
}

// ---------------------------------------------------------------------------
// Moldura institucional — compartilhada pelos dois layouts
// ---------------------------------------------------------------------------

/** Logo grande no canto inferior esquerdo, como na referência aprovada. O
 *  selo pequeno "Design created by ARCIL AI" continua sendo aplicado depois,
 *  fora daqui (`route.ts`), no canto superior direito. */
function logoNo(W: number, H: number): No | null {
  const src = logoArcil();
  if (!src) return null;
  const largura = Math.round(W * 0.13);
  return el(
    "div",
    { position: "absolute", left: Math.round(W * FAIXA.margemFrac), top: Math.round(H - H * 0.075), opacity: 0.92 },
    img(src, { width: largura, height: Math.round(largura * 0.28), objectFit: "contain" })
  );
}

function qrNo(dataUrl: string | null, W: number, H: number, ehManual: boolean): No | null {
  if (!dataUrl) return null;
  const lado = Math.round(W * 0.055);
  const largura = lado + Math.round(W * 0.075);
  return el(
    "div",
    {
      position: "absolute",
      left: Math.round(W - W * FAIXA.margemFrac - largura),
      top: Math.round(H - H * 0.085),
      width: largura,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    el(
      "div",
      { flexDirection: "column", alignItems: "flex-end", marginRight: 8, width: largura - lado - 8 },
      el(
        "div",
        { fontSize: 9.5, color: CLARO, textShadow: SOMBRA_TEXTO, textAlign: "right", lineHeight: 1.25 },
        ehManual ? "Escaneie para acessar o manual" : "Escaneie para abrir esta prévia"
      )
    ),
    img(dataUrl, { width: lado, height: lado, borderRadius: 4 })
  );
}

function seloAprovacaoNo(W: number, H: number): No {
  const largura = Math.round(W * 0.235);
  return el(
    "div",
    {
      position: "absolute",
      left: Math.round(W * FAIXA.margemFrac),
      top: Math.round(H * 0.795),
      width: largura,
      alignItems: "center",
      background: CARD_FUNDO,
      border: `1px solid ${CARD_BORDA}`,
      borderRadius: CARD_RAIO,
      padding: "9px 12px",
    },
    el(
      "div",
      { width: 18, height: 18, borderRadius: 9, background: AZUL, alignItems: "center", justifyContent: "center", marginRight: 9, flexShrink: 0 },
      img(b64svg(ICONE_CHECK.replace(/stroke="[^"]*"/, 'stroke="#0b1220"')), { width: 11, height: 11 })
    ),
    el(
      "div",
      { flexDirection: "column", flex: 1 },
      el("div", { fontSize: 10.5, fontWeight: 700, color: CLARO, letterSpacing: 0.5 }, SELO_APROVACAO.titulo),
      el("div", { fontSize: 9.5, color: CINZA, marginTop: 2 }, SELO_APROVACAO.corpo)
    )
  );
}

/** Card MODELO: o dado que o cliente mais olha, exatamente com o valor que o
 *  vendedor escolheu no catálogo do ERP — nunca reescrito por IA. */
function cardModeloNo(d: DadosOverlay, largura: number): No {
  // Sem repetir a marca quando o nome de catálogo do ERP já começa por ela —
  // "SPRINGER MIDEA SPLIT CASSETE ... SPRINGER MIDEA" saiu assim na primeira
  // prévia real.
  const nome = d.produto.trim();
  const marca = (d.marca ?? "").trim();
  const linhaProduto = marca && !nome.toUpperCase().startsWith(marca.toUpperCase()) ? `${marca} ${nome}` : nome;
  return el(
    "div",
    {
      width: largura,
      flexDirection: "column",
      background: CARD_FUNDO,
      border: `1px solid ${CARD_BORDA}`,
      borderRadius: CARD_RAIO,
      padding: "11px 14px",
    },
    el("div", { fontSize: 11, fontWeight: 700, color: CLARO, letterSpacing: 0.9 }, "MODELO:"),
    el("div", { fontSize: 12, color: CLARO, marginTop: 4, lineHeight: 1.35, width: largura - 28 }, linhaProduto || d.produto),
    d.capacidade || d.sku
      ? el(
          "div",
          { fontSize: 10.5, color: CINZA, marginTop: 3 },
          [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · ")
        )
      : null
  );
}

/** Card de lembretes do rodapé. O conteúdo vem de
 *  `HVAC_STANDARDS[tipo].recomendacoes_garantia` — é o texto certo para o tipo
 *  de equipamento, não uma lista fixa igual para todo mundo. */
function cardLembretesNo(d: DadosOverlay, left: number, top: number, largura: number): No {
  return el(
    "div",
    {
      position: "absolute",
      left,
      top,
      width: largura,
      flexDirection: "column",
      background: CARD_FUNDO,
      border: `1px solid ${CARD_BORDA}`,
      borderRadius: CARD_RAIO,
      padding: "11px 14px",
    },
    el("div", { fontSize: 11, fontWeight: 700, color: CLARO, letterSpacing: 0.9, marginBottom: 7 }, "LEMBRETES IMPORTANTES PARA INSTALAÇÃO"),
    ...d.recomendacoesGarantia.slice(0, 5).map((texto) =>
      el(
        "div",
        { alignItems: "flex-start", marginBottom: 4 },
        img(b64svg(ICONE_CHECK), { width: 11, height: 11, marginRight: 8, marginTop: 2, flexShrink: 0 }),
        el("div", { fontSize: 10.5, color: CLARO, lineHeight: 1.35, flex: 1 }, texto)
      )
    )
  );
}

function rodapeLegalNo(W: number, H: number): No {
  return el(
    "div",
    // À direita do logo, não embaixo: os dois moram na mesma faixa inferior e
    // o texto legal ficava atravessado por cima da marca.
    { position: "absolute", left: Math.round(W * 0.175), top: Math.round(H - H * 0.05), width: Math.round(W * 0.48) },
    el("div", { fontSize: 8.5, color: CINZA, lineHeight: 1.25, textShadow: SOMBRA_TEXTO }, RODAPE_LEGAL)
  );
}

// ---------------------------------------------------------------------------
// Layout ANCORADO (com marcação do vendedor)
// ---------------------------------------------------------------------------

function camadaAncorada(d: DadosOverlay, W: number, H: number, qrDataUrl: string | null): No {
  // `d.marcacao` foi verificado por quem chama; o `!` aqui é o preço de manter
  // a checagem num lugar só em vez de espalhar guardas equivalentes.
  const marcacao = d.marcacao!;
  const margem = Math.round(W * FAIXA.margemFrac);
  const larguraCard = Math.round(W * 0.21);

  // UMA decisão de espelhamento para a imagem inteira: a coluna de cards
  // (legenda, painel da condensadora, modelo) fica do lado com mais espaço
  // livre em relação ao aparelho, e os callouts flutuantes vão para o lado
  // oposto. Quando cada grupo escolhia o próprio lado, com o aparelho marcado
  // perto de uma borda os dois caíam no mesmo canto, um por cima do outro.
  const centroCaixa = marcacao.caixa.x + marcacao.caixa.w / 2;
  const cardsNaDireita = centroCaixa <= 0.55;
  const xCards = cardsNaDireita ? W - margem - larguraCard : margem;
  const ladoTexto: 1 | -1 = cardsNaDireita ? -1 : 1;

  const plano = planoAnotacoes(d, marcacao, W, H, ladoTexto);

  // O selo "Design created by ARCIL AI" é composto depois, colado no topo
  // direito (route.ts). A coluna começa abaixo dele — na primeira prévia real a
  // legenda saiu por baixo do selo.
  const topoCards = Math.max(Math.round(H * 0.05), 64);

  return el(
    "div",
    {
      width: W,
      height: H,
      position: "relative",
      fontFamily: "Montserrat",
      // Véu suave só nas pontas: o miolo da cena — o que o cliente quer ver —
      // fica sem filtro, e o texto se sustenta pela sombra própria.
      backgroundImage:
        "linear-gradient(to bottom, rgba(4,9,18,0.5) 0%, rgba(4,9,18,0.16) 12%, rgba(4,9,18,0) 22%," +
        " rgba(4,9,18,0) 68%, rgba(4,9,18,0.42) 84%, rgba(4,9,18,0.78) 100%)",
    },
    img(svgDasLinhas(plano.linhas, W, H), { position: "absolute", left: 0, top: 0, width: W, height: H }),
    ...plano.nos,
    // UMA coluna de verdade, não três blocos posicionados em `top` calculado a
    // dedo. O painel do equipamento muda de altura conforme tenha ou não foto
    // do produto, então qualquer `top` fixo para o card seguinte acerta num
    // caso e sobrepõe no outro — foi exatamente o que aconteceu na primeira
    // prévia real. Com flex column + gap o empilhamento é do layout.
    el(
      "div",
      { position: "absolute", left: xCards, top: topoCards, width: larguraCard, flexDirection: "column", gap: 12 },
      legendaInfraNo(larguraCard),
      painelCondensadoraNo(d, larguraCard, CARD_FUNDO, CARD_BORDA, CARD_RAIO),
      cardModeloNo(d, larguraCard)
    ),
    cardLembretesNo(d, W - margem - Math.round(W * 0.235), Math.round(H * 0.7), Math.round(W * 0.235)),
    seloAprovacaoNo(W, H),
    logoNo(W, H),
    qrNo(qrDataUrl, W, H, d.qrEhManual === true),
    rodapeLegalNo(W, H)
  );
}

// ---------------------------------------------------------------------------
// Layout de CARDS (sem marcação) — comportamento anterior, preservado
// ---------------------------------------------------------------------------

function spec(rotulo: string, valor: string): No {
  return el("div", { flexDirection: "column", marginBottom: 3 },
    el("div", { fontSize: 9, color: CINZA }, rotulo),
    el("div", { fontSize: 11.5, color: CLARO, fontWeight: 600, marginTop: 1 }, valor)
  );
}

function cartao(titulo: string, corpo: No, flex = 1): No {
  return el("div", {
    flexDirection: "column", flex, padding: "7px 10px", borderRadius: 9,
    border: "1px solid " + BORDA, background: "rgba(6,12,22,0.55)",
  },
    el("div", { fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: AZUL, marginBottom: 4 }, titulo),
    corpo
  );
}

function topo(d: DadosOverlay): No {
  return el("div", { flexDirection: "column", padding: "14px 24px 0" },
    el("div", { fontSize: 22, fontWeight: 700, color: "#ffffff", lineHeight: 1.05, textShadow: SOMBRA_TITULO }, "PRÉVIA TÉCNICA DE INSTALAÇÃO"),
    el("div", { fontSize: 13, marginTop: 4, color: CINZA, textShadow: SOMBRA_TITULO },
      el("span", { color: AZUL, fontWeight: 700 }, d.produto),
      d.sku ? el("span", { marginLeft: 8 }, "· " + d.sku) : null
    ),
    el("div", { width: 120, height: 2, background: AZUL, marginTop: 7, marginBottom: 6 }),
    el("div", { alignItems: "center" },
      // Marcador desenhado, não caractere: "✓" (U+2713) não existe na Montserrat
      // e saía como quadradinho de glifo ausente.
      el("div", { width: 6, height: 6, borderRadius: 3, background: AZUL, marginRight: 8 }),
      el("div", { fontSize: 11, color: CLARO, textShadow: SOMBRA_TITULO },
        "Posicionamento conforme manual preserva a garantia de fábrica.")
    )
  );
}

/** Rótulo e presença dos cards mudam por tipo: "distância do teto" não
 *  significa nada para um cassete que já mora no teto, e janela não tem
 *  tubulação frigorígena exposta pra mostrar. */
function especificacoes(d: DadosOverlay): No[] {
  const t = d.tipoEquipamento.trim().toLowerCase();
  const specs: No[] = [];

  if (t === "cassete") {
    specs.push(spec("Espaço no forro (plenum)", d.distanciaTeto));
    specs.push(spec("Distância das paredes", d.espacamentoLateral));
  } else if (t === "dutado") {
    specs.push(spec("Espaço técnico (plenum)", d.distanciaTeto));
    specs.push(spec("Afastamento da rede de dutos", d.espacamentoLateral));
  } else if (t === "janela") {
    // Unidade única no vão: nenhuma das três cotas genéricas descreve essa
    // instalação.
  } else {
    specs.push(spec("Distância do teto", d.distanciaTeto));
    specs.push(spec("Espaçamento lateral", d.espacamentoLateral));
    specs.push(spec("Altura de instalação", d.alturaInstalacao));
  }

  if (d.peDireito) {
    const rotuloPeDireito = t === "cassete" || t === "dutado" ? "Altura laje-forro" : t === "janela" ? "Medidas do vão" : "Pé-direito";
    specs.push(spec(rotuloPeDireito, d.peDireito));
  }
  if (d.tubulacao) specs.push(spec("Tubulação", d.tubulacao));
  if (d.pontoEletrico != null) specs.push(spec("Ponto elétrico", d.pontoEletrico ? "já existe" : "a executar"));
  if (t === "cassete" && d.alcapao != null) specs.push(spec("Alçapão de inspeção", d.alcapao ? "incluso na instalação" : "não incluso"));
  if (d.metragemInfra) specs.push(spec("Metragem de infra (tubo/dreno/cabo)", d.metragemInfra));

  return specs;
}

function base(d: DadosOverlay): No {
  const specs = especificacoes(d);

  const passos = passosPara(d.tipoEquipamento).map((p, i) =>
    el("div", { alignItems: "center", marginBottom: 4 },
      el("div", {
        alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 9,
        border: "1.5px solid " + AZUL, marginRight: 7, flexShrink: 0,
      }, img(b64svg(ICONES_PASSO[i] ?? ICONE_TESTE), { width: 10, height: 10 })),
      el("div", { fontSize: 10.5, color: CLARO, flex: 1 }, p)
    )
  );

  // Sem a foto do produto aqui: a foto real só deve aparecer composta na cena,
  // não duplicada no card. No lugar dela, um mini-esquema NÃO realista
  // (install-schematic.ts). O SVG só desenha linha; o texto vem daqui, como nó
  // satori de verdade posicionado por cima na fração que o esquema devolve.
  const ESQUEMA_RENDER_W = 132;
  const renderEsquema = (svg: string, rotulos: ReturnType<typeof esquemaInstalacao>["rotulos"], vbW: number, vbH: number) => {
    const renderH = Math.round((ESQUEMA_RENDER_W * vbH) / vbW);
    return el("div", { position: "relative", width: ESQUEMA_RENDER_W, height: renderH },
      img(b64svg(svg), { position: "absolute", left: 0, top: 0, width: ESQUEMA_RENDER_W, height: renderH }),
      // `ancora` decide de que lado do ponto (xFrac) o texto cresce — satori
      // (Yoga) não resolve `transform: translateX(-50%)` de forma confiável.
      ...rotulos.map((r) => {
        const centralW = 108;
        const central = r.ancora === "center";
        const estilo = central
          ? { left: Math.max(0, r.xFrac * ESQUEMA_RENDER_W - centralW / 2), width: Math.min(centralW, ESQUEMA_RENDER_W), textAlign: "center" as const }
          : r.ancora === "left"
            ? { left: r.xFrac * ESQUEMA_RENDER_W }
            : { right: ESQUEMA_RENDER_W - r.xFrac * ESQUEMA_RENDER_W };
        return el("div", {
          position: "absolute",
          top: r.yFrac * renderH - r.tamanho,
          fontSize: r.tamanho,
          color: r.cor,
          lineHeight: 1.15,
          whiteSpace: central ? "normal" : "nowrap",
          ...estilo,
        }, r.texto);
      })
    );
  };

  const { svg: esquemaSvg, rotulos: esquemaRotulos } = esquemaInstalacao(d);
  const esquemaCond = esquemaCondensadora(d);
  const equipamento = el("div", { flexDirection: "column", alignItems: "center" },
    renderEsquema(esquemaSvg, esquemaRotulos, ESQUEMA_W, ESQUEMA_H),
    esquemaCond ? el("div", { marginTop: 4 }, renderEsquema(esquemaCond.svg, esquemaCond.rotulos, ESQUEMA_W, ESQUEMA_COND_H)) : null,
    el("div", { fontSize: 12, fontWeight: 700, color: CLARO, marginTop: 4 }, d.marca ?? "—"),
    el("div", { fontSize: 9, color: CINZA, marginTop: 1 }, d.tipoEquipamento)
  );

  const itemGarantia = (icone: string, texto: string) =>
    el("div", { alignItems: "center", marginBottom: 3 },
      img(b64svg(icone), { width: 11, height: 11, marginRight: 6, flexShrink: 0 }),
      el("div", { flex: 1, fontSize: 10 }, texto)
    );
  const garantia = el("div", { flexDirection: "column", fontSize: 11, color: CLARO, lineHeight: 1.4 },
    ...d.recomendacoesGarantia.map((texto) => itemGarantia(iconeGarantiaPara(texto), texto))
  );

  return el("div", { flexDirection: "column", padding: "0 24px 11px" },
    el("div", { gap: 9 },
      el("div", { flexDirection: "column", flex: 1.05 },
        el("div", { fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: AZUL, marginBottom: 5 }, "PASSO A PASSO"),
        ...passos
      ),
      cartao("ESPECIFICAÇÕES", el("div", { flexDirection: "column" }, ...specs), 0.85),
      cartao("EQUIPAMENTO", equipamento, 0.7),
      cartao("GARANTIA DE FÁBRICA", garantia, 0.95)
    ),
    el("div", { marginTop: 6, fontSize: 9, color: CINZA, lineHeight: 1.25 }, RODAPE_LEGAL)
  );
}

/** Véu escuro só nas faixas de texto: um gradiente do topo e outro da base,
 *  deixando o miolo da cena sem filtro. */
function camadaCards(d: DadosOverlay, largura: number, altura: number): No {
  return el("div", {
    width: largura, height: altura, flexDirection: "column", justifyContent: "space-between",
    backgroundImage:
      "linear-gradient(to bottom, rgba(4,9,18,0.82) 0%, rgba(4,9,18,0.4) 7%, rgba(4,9,18,0) 14%," +
      " rgba(4,9,18,0) 66%, rgba(4,9,18,0.72) 79%, rgba(4,9,18,0.94) 89%)",
    fontFamily: "Montserrat",
  },
    topo(d),
    base(d)
  );
}

// ---------------------------------------------------------------------------

/**
 * Camada Commercial Technical V2 — cassete.
 *
 * O véu é bem mais leve que o da V1: a direção da V2 é vidro sobre fotografia,
 * não card escuro. As pontas continuam recebendo um degradê, porque o texto do
 * topo e do rodapé precisa de contraste garantido em foto clara.
 */
async function camadaCassetteV2(d: DadosOverlay, W: number, H: number): Promise<No> {
  const plano = planoCassetteCommercialV2(d, d.marcacao!, W, H, await qrDataUrl(d.urlPrevia));
  return el(
    "div",
    {
      width: W,
      height: H,
      position: "relative",
      fontFamily: "Montserrat",
      backgroundImage:
        "linear-gradient(to bottom, rgba(6,12,22,0.44) 0%, rgba(6,12,22,0.12) 14%, rgba(6,12,22,0) 26%," +
        " rgba(6,12,22,0) 66%, rgba(6,12,22,0.34) 84%, rgba(6,12,22,0.70) 100%)",
    },
    img(svgV2(plano.linhas, W, H), { position: "absolute", left: 0, top: 0, width: W, height: H }),
    ...plano.nos
  );
}

/** QR da própria prévia. Devolve `null` em falha — a prévia inteira não pode
 *  cair porque um QR não gerou. */
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
 * Devolve a cena com a camada técnica por cima, no mesmo tamanho da original,
 * como PNG (sem perda). Quem chama trata a falha — uma cena sem moldura ainda
 * serve, um erro não.
 *
 * De propósito NÃO codifica em JPEG aqui: quem chama ainda vai empilhar o selo
 * d'água por cima, e cada reencode JPEG intermediário perde qualidade de
 * geração em geração.
 */
export async function comporPrevia(cena: Buffer, dados: DadosOverlay): Promise<Buffer> {
  const meta = await sharp(cena).metadata();
  const largura = meta.width ?? 1024;
  const altura = meta.height ?? 1024;

  // A V2 entra só onde já foi validada: cassete, com marcação, e com a flag
  // ligada. Qualquer outra combinação continua saindo exatamente como antes —
  // é o que permite comparar as duas sem arriscar o que já está em produção.
  const ehCassete = dados.tipoEquipamento.trim().toLowerCase() === "cassete";
  const usaV2 = (V2_CASSETTE_LAYOUT || dados.forcarV2 === true) && ehCassete && dados.marcacao;

  const arvore = usaV2
    ? await camadaCassetteV2(dados, largura, altura)
    : dados.marcacao
      ? camadaAncorada(dados, largura, altura, await qrDataUrl(dados.urlPrevia))
      : camadaCards(dados, largura, altura);

  const svg = await satori(arvore as never, { width: largura, height: altura, fonts: fontes() });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return sharp(cena).composite([{ input: png, top: 0, left: 0 }]).png().toBuffer();
}
