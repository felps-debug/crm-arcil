import satori from "satori";
import sharp from "sharp";
import QRCode from "qrcode";
import { el, img, b64svg, fontes, logoArcilClaro, type No } from "./satori-nodes";
import { planoAnotacoes, legendaInfraNo, svgDasLinhas } from "./preview-annotations";
import { tubulacaoPeloModelo, type DadosOverlay } from "./previa-tipos";
import { nomeComMarca, semPontoFinal } from "./texto-previa";
import { CONDENSADORA_BULLETS } from "@/constants/hvac-standards";
import { AZUL, CLARO, CINZA, PRANCHA, RODAPE_LEGAL } from "@/constants/arcil-brand";

export type { DadosOverlay } from "./previa-tipos";

/**
 * Prancha Arcil: a foto do cliente inteira à esquerda, sem nada por cima além
 * do que está preso ao aparelho (legendas com linha, cota, fluxo de ar), e uma
 * faixa fixa à direita com condensadora, modelo, garantia, QR e assinatura.
 *
 * Antes os cards eram desenhados POR CIMA da foto e cobriam ~1/4 do ambiente;
 * o cliente quer ver a casa dele. Altura fixa e faixa fixa fazem toda prévia
 * ter a mesma cara, seja a foto em pé ou deitada.
 *
 * O modelo de imagem desenha só a cena. Todo texto aqui é vetor (satori, fonte
 * local): modelo de imagem já escreveu "2,80m" onde o vendedor respondeu 2,70.
 */
export const ALTURA_PRANCHA = PRANCHA.altura;
export const LARGURA_FAIXA = PRANCHA.larguraFaixa;

const FAIXA_FUNDO = "#0B1220";
const CARTAO_FUNDO = "#121B2C";
const CARTAO_BORDA = "rgba(255,255,255,0.10)";
const AMBAR = "#F5C542";
const PAD = 34;
const INTERNA = LARGURA_FAIXA - PAD * 2;
const MIOLO_CARTAO = INTERNA - 40;

// Ícones de linha simples no card de garantia — se lê mais rápido que um "·".
const TRACO = { fill: "none", stroke: AZUL, "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
const attrs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");
const ICONE_TUBULACAO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 8h9a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h7" ${attrs(TRACO)}/></svg>`;
const ICONE_TESTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" ${attrs(TRACO)}/><path d="M12 13 15 9" ${attrs(TRACO)}/><path d="M12 4v2" ${attrs(TRACO)}/></svg>`;
const ICONE_GOTA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3C12 3 6 11 6 15.2a6 6 0 0 0 12 0C18 11 12 3 12 3Z" ${attrs(TRACO)}/></svg>`;
const ICONE_RAIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" ${attrs(TRACO)}/></svg>`;
const ICONE_VEDACAO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" ${attrs(TRACO)}/><path d="M8 12h8" ${attrs(TRACO)}/></svg>`;
const ICONE_ALERTA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z" fill="none" stroke="${AMBAR}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v5M12 18v.5" stroke="${AMBAR}" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function iconeGarantiaPara(texto: string): string {
  const t = texto.toLowerCase();
  if (/tubulaç|cobre/.test(t)) return ICONE_TUBULACAO;
  if (/vácuo|vacuo|estanqueidade|teste/.test(t)) return ICONE_TESTE;
  if (/dreno|drenagem|caimento/.test(t)) return ICONE_GOTA;
  if (/elétric|eletric|aterr|disjuntor/.test(t)) return ICONE_RAIO;
  if (/vedaç|aletas|frestas/.test(t)) return ICONE_VEDACAO;
  return ICONE_TESTE;
}

function titulo(texto: string): No {
  return el("div", { fontSize: 19, fontWeight: 700, color: AZUL, letterSpacing: 1.4, marginBottom: 12 }, texto);
}

function cartao(...filhos: (No | null)[]): No {
  return el(
    "div",
    { width: INTERNA, flexDirection: "column", background: CARTAO_FUNDO, border: `1px solid ${CARTAO_BORDA}`, borderRadius: 16, padding: 20 },
    ...filhos
  );
}

/** Janela é peça única: não tem condensadora separada. */
function cartaoCondensadora(d: DadosOverlay): No | null {
  if (d.tipoEquipamento.trim().toLowerCase() === "janela") return null;
  const local = d.unidadeExterna ? semPontoFinal(d.unidadeExterna) : null;
  const linha = [
    local,
    d.distanciaCondensadora ? `${d.distanciaCondensadora} da evaporadora` : null,
    d.nivelCondensadora ? semPontoFinal(d.nivelCondensadora).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return cartao(
    titulo("CONDENSADORA"),
    d.cenaCondensadoraBase64
      ? el(
          "div",
          { flexDirection: "column" },
          img(d.cenaCondensadoraBase64, { width: MIOLO_CARTAO, height: Math.round(MIOLO_CARTAO * 0.62), objectFit: "cover", borderRadius: 8 }),
          el("div", { fontSize: 15, fontStyle: "italic", color: CINZA, marginTop: 8 }, "Ilustração: forma correta de instalação")
        )
      : // Sem cena (n8n falhou ou não conhece o local): os afastamentos mínimos
        // em texto ainda dizem ao instalador o que importa para a garantia.
        el(
          "div",
          { flexDirection: "column" },
          el("div", { fontSize: 15, color: CINZA, marginBottom: 6 }, "Afastamentos mínimos:"),
          ...CONDENSADORA_BULLETS.map((b) => el("div", { fontSize: 17, color: CLARO, lineHeight: 1.4, width: MIOLO_CARTAO }, `• ${b}`))
        ),
    linha ? el("div", { fontSize: 18, color: CLARO, marginTop: 12, lineHeight: 1.35, width: MIOLO_CARTAO }, linha) : null
  );
}

/** O nome é exatamente o do catálogo do ERP — nunca reescrito por IA. */
function cartaoModelo(d: DadosOverlay): No {
  const alturaFoto = Math.round(MIOLO_CARTAO * 0.42);
  return cartao(
    titulo("MODELO"),
    d.produtoImagemBase64
      ? el(
          "div",
          { width: MIOLO_CARTAO, height: alturaFoto, background: "#FFFFFF", borderRadius: 8, justifyContent: "center", alignItems: "center", marginBottom: 8 },
          img(d.produtoImagemBase64, { width: MIOLO_CARTAO - 12, height: alturaFoto - 12, objectFit: "contain" })
        )
      : null,
    el("div", { fontSize: 20, fontWeight: 700, color: CLARO, lineHeight: 1.3, width: MIOLO_CARTAO }, nomeComMarca(d.produto, d.marca) || d.produto),
    d.capacidade || d.sku
      ? el("div", { fontSize: 17, color: CINZA, marginTop: 6 }, [d.capacidade, d.sku ? `SKU ${d.sku}` : null].filter(Boolean).join(" · "))
      : null
  );
}

function itemIcone(icone: string, texto: string, cor: string): No {
  return el(
    "div",
    { alignItems: "flex-start", marginBottom: 10, width: MIOLO_CARTAO },
    img(b64svg(icone), { width: 22, height: 22, marginRight: 10, marginTop: 1, flexShrink: 0 }),
    el("div", { fontSize: 17, color: cor, lineHeight: 1.38, flex: 1 }, texto)
  );
}

function cartaoGarantia(d: DadosOverlay): No | null {
  // Alertas primeiro: são o que muda de uma instalação para outra. No máximo 7
  // linhas no total, para a faixa nunca estourar a altura fixa.
  const alertas = d.alertas.slice(0, 4);
  const recomendacoes = d.recomendacoesGarantia.slice(0, Math.max(0, 7 - alertas.length));
  if (alertas.length === 0 && recomendacoes.length === 0) return null;
  return cartao(
    titulo("CUIDADOS PARA A GARANTIA"),
    ...alertas.map((a) => itemIcone(ICONE_ALERTA, a, AMBAR)),
    ...recomendacoes.map((r) => itemIcone(iconeGarantiaPara(r), r, CLARO))
  );
}

async function faixa(d: DadosOverlay, x: number, qr: string | null): Promise<No> {
  const logo = await logoArcilClaro();
  return el(
    "div",
    { position: "absolute", left: x, top: 0, width: LARGURA_FAIXA, height: ALTURA_PRANCHA, background: FAIXA_FUNDO, flexDirection: "column", padding: PAD, gap: 22 },
    logo ? img(logo, { width: 216, height: 72, objectFit: "contain", opacity: 0.9 }) : null,
    cartaoCondensadora(d),
    cartaoModelo(d),
    // No modo `vetorial` o CRM desenha o feixe colorido, e a legenda explica as cores.
    !tubulacaoPeloModelo(d.modoInfra) ? legendaInfraNo(INTERNA) : null,
    cartaoGarantia(d),
    el(
      "div",
      { marginTop: "auto", flexDirection: "column", gap: 14 },
      qr
        ? el(
            "div",
            { alignItems: "center", gap: 16 },
            el(
              "div",
              { width: 128, height: 128, background: "#FFFFFF", borderRadius: 12, justifyContent: "center", alignItems: "center" },
              img(qr, { width: 112, height: 112 })
            ),
            el("div", { fontSize: 17, color: CLARO, width: INTERNA - 144 }, d.qrEhManual ? "Manual de instalação do fabricante" : "Conheça a ARCIL")
          )
        : null,
      el("div", { fontSize: 13, color: CINZA, lineHeight: 1.35, width: INTERNA }, RODAPE_LEGAL),
      el("div", { fontSize: 12, color: "rgba(169,184,206,0.75)", fontStyle: "italic" }, "Imagem gerada pela IA da Arcil")
    )
  );
}

/** QR em falha devolve `null` — a prévia inteira não pode cair por causa dele. */
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
 * Compõe a prancha: cena escalada para `ALTURA_PRANCHA` + faixa à direita.
 *
 * Devolve PNG de propósito: quem chama faz o único encode JPEG — cada reencode
 * intermediário perde qualidade.
 */
export async function comporPrevia(cena: Buffer, dados: DadosOverlay): Promise<Buffer> {
  const cenaNorm = await sharp(cena).resize({ height: ALTURA_PRANCHA }).png().toBuffer();
  const larguraCena = (await sharp(cenaNorm).metadata()).width ?? ALTURA_PRANCHA;
  const W = larguraCena + LARGURA_FAIXA;
  const H = ALTURA_PRANCHA;

  // Callouts do lado com mais parede livre em relação ao aparelho.
  const plano = dados.marcacao
    ? planoAnotacoes(dados, dados.marcacao, larguraCena, H, dados.marcacao.caixa.x + dados.marcacao.caixa.w / 2 <= 0.5 ? 1 : -1, { prancha: true })
    : { linhas: "", nos: [] as No[] };

  const arvore = el(
    "div",
    { width: W, height: H, position: "relative", fontFamily: "Montserrat" },
    plano.linhas ? img(svgDasLinhas(plano.linhas, larguraCena, H), { position: "absolute", left: 0, top: 0, width: larguraCena, height: H }) : null,
    ...plano.nos,
    await faixa(dados, larguraCena, await qrDataUrl(dados.urlPrevia))
  );

  const svg = await satori(arvore as never, { width: W, height: H, fonts: fontes() });
  const camada = await sharp(Buffer.from(svg)).png().toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: FAIXA_FUNDO } })
    .composite([
      { input: cenaNorm, left: 0, top: 0 },
      { input: camada, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}
