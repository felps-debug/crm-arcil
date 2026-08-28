import sharp from "sharp";
import type { Marcacao } from "@/lib/marcacao";

/**
 * Desenha a marcação do vendedor por cima da foto do ambiente e devolve a
 * imagem-guia que vai como TERCEIRA imagem no payload do Gemini.
 *
 * Por que uma imagem em vez de coordenadas no texto: modelo de imagem obedece
 * máscara visual, não aritmética. "instale em x:0.42 y:0.28 w:0.16" é
 * justamente o tipo de instrução que ele aproxima mal — foi o mesmo motivo de
 * a âncora por grade 3x3 do GPT-4o Vision ter sido abandonada. Um retângulo
 * desenhado na própria foto ele acerta.
 *
 * As cores são propositalmente impossíveis num ambiente residencial (magenta
 * puro, ciano puro, amarelo puro saturados). Se a guia usasse branco ou cinza,
 * o modelo poderia lê-la como moldura, sanca ou eletrocalha real da cena e
 * reproduzir a marcação como objeto físico no resultado.
 *
 * A regra de NÃO desenhar as marcas na saída vive no prompt do n8n
 * (`GERADOR DE PROMPT2`, bloco `# GUIDE IMAGE`). Aqui só se produz a guia.
 */

export const COR_GUIA_CAIXA = "#FF00FF";
export const COR_GUIA_ROTA = "#00FFFF";
export const COR_GUIA_ELETRICO = "#FFFF00";

/**
 * @returns base64 (sem prefixo `data:`) do JPEG da imagem-guia, ou `null` em
 * qualquer falha. `null` é tratável: quem chama segue sem a guia, e a
 * descrição textual da marcação (`descreverMarcacao`) ainda vai no prompt.
 * Uma guia que não renderizou não pode custar a geração inteira.
 */
export async function renderGuideMask(fotoOriginal: Buffer, m: Marcacao): Promise<string | null> {
  try {
    const meta = await sharp(fotoOriginal).metadata();
    const W = meta.width ?? 1024;
    const H = meta.height ?? 1024;

    const px = (fx: number) => (fx * W).toFixed(1);
    const py = (fy: number) => (fy * H).toFixed(1);
    // A espessura acompanha o tamanho da foto: um traço de 4px fixo some numa
    // foto de 4000px de celular moderno e engorda demais numa de 800px.
    const traco = Math.max(3, Math.round(Math.min(W, H) * 0.006));

    const partes: string[] = [];

    const { caixa } = m;
    // Cantos em L, não retângulo preenchido.
    //
    // O retângulo magenta semitransparente vazou para uma prévia real: o modelo
    // tratou a marca como objeto da cena e a pintou na parede. Marca preenchida
    // e fechada é justamente o que ele reconhece como "coisa"; quatro cantos
    // finos e abertos delimitam a mesma área sem formar uma figura que ele
    // queira reproduzir.
    const x1 = caixa.x * W;
    const y1 = caixa.y * H;
    const x2 = (caixa.x + caixa.w) * W;
    const y2 = (caixa.y + caixa.h) * H;
    const braco = Math.min(caixa.w * W, caixa.h * H) * 0.3;
    const cantos: [number, number, number, number][] = [
      [x1, y1, 1, 1],
      [x2, y1, -1, 1],
      [x1, y2, 1, -1],
      [x2, y2, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of cantos) {
      partes.push(
        `<path d="M ${(cx + sx * braco).toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${(cy + sy * braco).toFixed(1)}" ` +
          `fill="none" stroke="${COR_GUIA_CAIXA}" stroke-width="${traco}" stroke-linecap="round"/>`
      );
    }

    // Cruz no centro: dá ao modelo um alvo pontual além da área. Com só a
    // moldura, unidades pequenas eram desenhadas encostadas numa das bordas em
    // vez de centradas no vão marcado.
    const ccx = caixa.x + caixa.w / 2;
    const ccy = caixa.y + caixa.h / 2;
    const bracoCruz = Math.min(caixa.w, caixa.h) * 0.16;
    partes.push(
      `<path d="M ${px(ccx - bracoCruz)} ${py(ccy)} L ${px(ccx + bracoCruz)} ${py(ccy)} M ${px(ccx)} ${py(ccy - bracoCruz)} L ${px(ccx)} ${py(ccy + bracoCruz)}" ` +
        `stroke="${COR_GUIA_CAIXA}" stroke-width="${traco}" stroke-linecap="round"/>`
    );

    if (m.rota.length >= 2) {
      const d = "M " + m.rota.map((p) => `${px(p.x)} ${py(p.y)}`).join(" L ");
      partes.push(`<path d="${d}" fill="none" stroke="${COR_GUIA_ROTA}" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    if (m.pontoEletrico) {
      partes.push(
        `<circle cx="${px(m.pontoEletrico.x)}" cy="${py(m.pontoEletrico.y)}" r="${traco * 2.5}" ` +
          `fill="${COR_GUIA_ELETRICO}" fill-opacity="0.55" stroke="${COR_GUIA_ELETRICO}" stroke-width="${traco}"/>`
      );
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${partes.join("")}</svg>`;
    const overlay = await sharp(Buffer.from(svg)).png().toBuffer();

    // Normaliza junto com o composite: o Gemini recebe a guia e a foto original
    // como duas imagens, e mandar a guia em resolução cheia de celular só
    // aumenta o payload sem ajudar o modelo a ver um retângulo.
    const guia = await sharp(fotoOriginal)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    return guia.toString("base64");
  } catch (err) {
    console.error("[guide-mask] falhou ao desenhar a imagem-guia:", err instanceof Error ? err.message : err);
    return null;
  }
}
