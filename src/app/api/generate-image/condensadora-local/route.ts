import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/server/api-auth";
import { N8N_CONDENSADORA_WEBHOOK } from "@/lib/env";
import { assertEnv } from "@/lib/server/env-guard";
import { CONDENSADORA_BULLETS } from "@/constants/hvac-standards";
import { LOCAIS_CONDENSADORA, type LocalCondensadora } from "@/lib/alertas-instalacao";
import { gerarCenaCondensadora } from "@/lib/server/cena-condensadora";

/**
 * Gera, sob demanda, uma imagem ilustrativa (cenário genérico, não o local
 * real do cliente — não temos foto do telhado/laje/sacada dele) mostrando a
 * condensadora real instalada num dos 3 locais típicos. Separado da geração
 * principal de propósito: só chama o Gemini (custo) quando o vendedor pede
 * uma opção específica, não em toda geração — ver conversa com o Luke sobre
 * controlar gasto de crédito de teste.
 *
 * O texto (título + bullets) é vetorial via satori, nunca pedido ao modelo de
 * imagem — mesma razão de sempre neste projeto: modelo de imagem erra texto.
 */

const TIPOS_LOCAL: string[] = LOCAIS_CONDENSADORA.map((l) => l.chave);
type TipoLocal = LocalCondensadora;

const TITULOS: Record<TipoLocal, string> = {
  telhado: "NO TELHADO",
  laje_tecnica: "NA LAJE TÉCNICA / CASA DE MÁQUINAS",
  sacada_tecnica: "EM SACADA TÉCNICA",
  parede_externa: "EM SUPORTE NA PAREDE EXTERNA",
  chao: "EM BASE NO CHÃO",
};

// O que é próprio de cada local. Os afastamentos de garantia entram depois,
// iguais para os três — quem muda com o local é o tipo de fixação e proteção,
// não a cota mínima.
const BULLETS_BASE: Record<TipoLocal, string[]> = {
  telhado: ["Base nivelada e fixa, resistente a vento e chuva"],
  laje_tecnica: ["Local ventilado, com acesso livre para manutenção"],
  sacada_tecnica: ["Local exclusivo e ventilado, protegido de chuva direta"],
  parede_externa: ["Suporte metálico nivelado, chumbado em parede estrutural"],
  chao: ["Base elevada e nivelada, longe de poças e de terra"],
};

/**
 * A distância só vira texto se a resposta do vendedor tiver número.
 *
 * A pergunta é aberta ("onde ficará a unidade externa e a que distância
 * aproximada"), e ele costuma responder só o lugar. Ecoando isso sem filtro
 * saía "Distância aproximada: Sacada" na imagem que vai para o cliente.
 */
function distanciaLegivel(texto: string | null): string | null {
  if (!texto || !/\d/.test(texto)) return null;
  return `Distância aproximada: ${texto.trim()}`;
}

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontesCache: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;
function fontes() {
  if (!fontesCache) {
    fontesCache = [
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Bold.ttf")), weight: 700, style: "normal" },
    ];
  }
  return fontesCache;
}

type No = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, ...children: (No | string | null | false)[]): No => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

async function fetchProductImageBase64(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    const normalizada = await sharp(original)
      .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return normalizada.toString("base64");
  } catch (err) {
    console.error("[condensadora-local] foto do produto indisponível:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function comporLegenda(cena: Buffer, tipoLocal: TipoLocal, distanciaTexto: string | null): Promise<Buffer> {
  const meta = await sharp(cena).metadata();
  const largura = meta.width ?? 1024;
  const altura = meta.height ?? 1024;

  const distancia = distanciaLegivel(distanciaTexto);
  const bullets = [...BULLETS_BASE[tipoLocal], ...CONDENSADORA_BULLETS, ...(distancia ? [distancia] : [])];

  const painel = el(
    "div",
    {
      position: "absolute", left: 0, bottom: 0, width: Math.round(largura * 0.46), padding: "16px 18px",
      flexDirection: "column", background: "linear-gradient(to top, rgba(4,9,18,0.88), rgba(4,9,18,0.55))",
    },
    el("div", { fontSize: 15, fontWeight: 700, color: "#4EA1FF", letterSpacing: 0.6, marginBottom: 2 }, TITULOS[tipoLocal]),
    el("div", { fontSize: 10, color: "#A9B8CE", marginBottom: 8 }, "Afastamentos mínimos conforme manual do fabricante"),
    ...bullets.map((b) =>
      el("div", { alignItems: "flex-start", marginBottom: 5 },
        el("div", { width: 5, height: 5, borderRadius: 3, background: "#4EA1FF", marginRight: 8, marginTop: 5, flexShrink: 0 }),
        el("div", { fontSize: 12, color: "#F2F6FC", lineHeight: 1.35, flex: 1 }, b)
      )
    )
  );

  const arvore = el("div", { width: largura, height: altura, position: "relative", fontFamily: "Montserrat" }, painel);
  const svg = await satori(arvore as never, { width: largura, height: altura, fonts: fontes() });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(cena).composite([{ input: png, top: 0, left: 0 }]).jpeg({ quality: 94 }).toBuffer();
}

export async function POST(request: NextRequest) {
  try {
    assertEnv("N8N_CONDENSADORA_WEBHOOK", N8N_CONDENSADORA_WEBHOOK);
  } catch (err) {
    console.error("[condensadora-local]", err);
    return Response.json({ error: "Configuração do servidor incompleta" }, { status: 500 });
  }

  const { response } = await requireApiPermission("manage_gerador_imagem", { strict: true });
  if (response) return response;

  const {
    leadId,
    tipoLocal,
    productImageUrl,
    distanciaTexto,
  }: { leadId?: string; tipoLocal?: string; productImageUrl?: string | null; distanciaTexto?: string | null } = await request.json();

  if (!tipoLocal || !TIPOS_LOCAL.includes(tipoLocal)) {
    return Response.json({ error: `tipoLocal deve ser um de: ${TIPOS_LOCAL.join(", ")}` }, { status: 400 });
  }
  const tipo = tipoLocal as TipoLocal;

  const productImageBase64 = await fetchProductImageBase64(productImageUrl ?? null);

  let urlBruta: string;
  try {
    urlBruta = await gerarCenaCondensadora({ leadId: leadId ?? crypto.randomUUID(), tipoLocal: tipo, productImageBase64 });
  } catch (err) {
    console.error("[condensadora-local]", err instanceof Error ? err.message : err);
    return Response.json({ error: "A automação de imagem não devolveu resultado. Verifique a execução no n8n." }, { status: 502 });
  }

  try {
    const cenaRes = await fetch(urlBruta);
    if (!cenaRes.ok) throw new Error(`fetch cena -> HTTP ${cenaRes.status}`);
    const cenaBuffer = Buffer.from(await cenaRes.arrayBuffer());
    const comLegenda = await comporLegenda(cenaBuffer, tipo, distanciaTexto ?? null);
    const dataUrl = `data:image/jpeg;base64,${comLegenda.toString("base64")}`;
    return Response.json({ imageUrl: dataUrl });
  } catch (err) {
    console.error("[condensadora-local] falhou compondo legenda, devolvendo cena crua:", err instanceof Error ? err.message : err);
    return Response.json({ imageUrl: urlBruta });
  }
}
