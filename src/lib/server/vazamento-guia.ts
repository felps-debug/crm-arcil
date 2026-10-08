import sharp from "sharp";

/**
 * Procura na cena gerada as cores da imagem-guia (magenta e ciano saturados).
 *
 * Aconteceu em produção: o modelo pintou o retângulo magenta da guia na parede
 * do cliente e a prévia foi entregue assim. O prompt proíbe, mas proibição não
 * é garantia — e esta checagem é determinística e custa milissegundos.
 *
 * Só conta a cor que NÃO existia na foto original naquele lugar. Sem isso,
 * vidro de janela azulado (ciano) dava alarme falso: em 2026-10-02 duas
 * gerações seguidas foram descartadas por causa da janela da sala, dobrando
 * tempo e custo — e a cena descartada era a melhor das duas.
 *
 * Amarelo forte existe em ambiente real (luminária, almofada), então fica de
 * fora.
 */

const LADO = 640;
/** Vizinhança tolerada entre foto e cena: o modelo desloca a imagem uns pixels. */
const RAIO = 3;
/** Aferido contra cenas reais: o vazamento deu 0,35% da imagem e as cenas
 *  limpas não passaram de 0,02%. O corte fica no meio, com folga. */
const FRACAO_MINIMA = 0.0012;

function corDaGuia(r: number, g: number, b: number): boolean {
  // Critério relativo, não absoluto: o magenta que o modelo pinta sai
  // dessaturado pela iluminação da cena (medido em rgb(176,80,176)).
  const magenta = r > 140 && b > 140 && g < r - 45 && g < b - 45;
  const ciano = g > 140 && b > 140 && r < g - 45 && r < b - 45;
  return magenta || ciano;
}

async function mapaDaGuia(img: Buffer, w: number, h: number): Promise<Uint8Array> {
  const { data, info } = await sharp(img).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mapa = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * info.channels;
    if (corDaGuia(data[i], data[i + 1], data[i + 2])) mapa[p] = 1;
  }
  return mapa;
}

export async function detectarVazamentoDaGuia(cena: Buffer, foto: Buffer | null): Promise<boolean> {
  try {
    // 640 px, não 160: o traço da guia é fino, e reduzir demais mistura ele com
    // a parede antes da contagem.
    const meta = await sharp(cena).metadata();
    const escala = LADO / Math.max(meta.width ?? LADO, meta.height ?? LADO);
    const w = Math.max(1, Math.round((meta.width ?? LADO) * escala));
    const h = Math.max(1, Math.round((meta.height ?? LADO) * escala));

    const naCena = await mapaDaGuia(cena, w, h);
    const naFoto = foto ? await mapaDaGuia(foto, w, h) : null;

    let suspeitos = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!naCena[y * w + x]) continue;
        if (naFoto && jaExistia(naFoto, w, h, x, y)) continue;
        suspeitos++;
      }
    }
    return suspeitos / (w * h) > FRACAO_MINIMA;
  } catch (err) {
    console.error("[generate-image] checagem de vazamento da guia falhou:", err instanceof Error ? err.message : err);
    return false;
  }
}

function jaExistia(mapa: Uint8Array, w: number, h: number, x: number, y: number): boolean {
  for (let dy = -RAIO; dy <= RAIO; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -RAIO; dx <= RAIO; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < w && mapa[yy * w + xx]) return true;
    }
  }
  return false;
}
