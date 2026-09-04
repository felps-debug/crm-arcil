import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Primitivos compartilhados pelos módulos que desenham a prévia técnica.
 *
 * Estavam duplicados literalmente em `installation-overlay.ts` e no antigo
 * `cutaway-diagram.ts` (mesmo `el`, mesmo `img`, mesmo `b64svg`, mesmo cache de
 * fonte). Enquanto os dois compunham imagens separadas, a duplicação era só
 * feia. Agora eles montam ramos da MESMA árvore satori — dois `el` com
 * defaults diferentes produziriam layout diferente no mesmo desenho.
 */

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
export type Fonte = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };
let fontesCache: Fonte[] | null = null;

/** satori converte texto em contorno usando a fonte que recebe, então nada
 *  depende de fonte instalada no servidor — o runtime da Vercel não tem
 *  nenhuma, e foi por isso que `<text>` em SVG saía em branco neste projeto. */
export function fontes(): Fonte[] {
  if (!fontesCache) {
    fontesCache = [
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-SemiBold.ttf")), weight: 600, style: "normal" },
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Bold.ttf")), weight: 700, style: "normal" },
    ];
  }
  return fontesCache;
}

export type No = { type: string; props: Record<string, unknown> };
export type Filho = No | string | null | false;

/** `display: flex` entra por padrão porque o satori recusa qualquer div com
 *  mais de um filho que não declare display — e ele só implementa flexbox
 *  mesmo, então declarar em cada nó seria repetição pura. */
export const el = (type: string, style: Record<string, unknown>, ...children: Filho[]): No => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

export const img = (src: string, style: Record<string, unknown>): No => ({
  type: "img",
  props: { src, style: { ...style } },
});

export function b64svg(svg: string): string {
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** Logo institucional em base64, lido uma vez. Vai como `<img>` porque é PNG
 *  — nada de texto dentro, então a armadilha de fonte em SVG não se aplica. */
let logoCache: string | null = null;
export function logoArcil(): string | null {
  if (logoCache === null) {
    try {
      const bytes = fs.readFileSync(path.join(process.cwd(), "public", "logo-arcil-full.png"));
      logoCache = "data:image/png;base64," + bytes.toString("base64");
    } catch (err) {
      console.error("[satori-nodes] logo indisponível:", err instanceof Error ? err.message : err);
      logoCache = "";
    }
  }
  return logoCache || null;
}

/** Variante cinza/dessaturada da logo — usada no rodapé fixo do layout
 *  "Desenho Técnico", mais discreta que a cor institucional cheia.
 *  Processada uma vez com `sharp` e cacheada em base64, igual `logoArcil()`. */
let logoClaroCache: string | null = null;
export async function logoArcilClaro(): Promise<string | null> {
  if (logoClaroCache === null) {
    try {
      const bytes = fs.readFileSync(path.join(process.cwd(), "public", "logo-arcil-full.png"));
      const cinza = await sharp(bytes).greyscale().toBuffer();
      logoClaroCache = "data:image/png;base64," + cinza.toString("base64");
    } catch (err) {
      console.error("[satori-nodes] logo cinza indisponível:", err instanceof Error ? err.message : err);
      logoClaroCache = "";
    }
  }
  return logoClaroCache || null;
}
