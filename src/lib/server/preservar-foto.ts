import sharp from "sharp";
import type { Marcacao } from "@/lib/marcacao";

/**
 * Devolve à cena gerada os pixels da foto original em tudo que fica fora da
 * zona da instalação.
 *
 * O modelo de imagem redesenha a foto inteira, e pedir no prompt "não mude o
 * resto" não garante nada: móvel, janela e cor da parede saem parecidos, não
 * iguais. Aqui o ambiente fica idêntico por construção — fora da zona, o pixel
 * É o da foto do cliente.
 *
 * Se o modelo deslocou ou reenquadrou a cena, misturar criaria um "fantasma"
 * (duas paredes desencontradas). Por isso a mistura só acontece quando, fora
 * da zona, as duas imagens já são parecidas.
 */

export type ZonaFrac = { x0: number; y0: number; x1: number; y1: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Caixa do aparelho ∪ rota da infraestrutura, expandida por `margem` (fração de cada eixo). */
export function zonaDaInstalacao(m: Marcacao, margem = 0.1): ZonaFrac {
  const xs = [m.caixa.x, m.caixa.x + m.caixa.w, ...m.rota.map((p) => p.x)];
  const ys = [m.caixa.y, m.caixa.y + m.caixa.h, ...m.rota.map((p) => p.y)];
  return {
    x0: clamp01(Math.min(...xs) - margem),
    y0: clamp01(Math.min(...ys) - margem),
    x1: clamp01(Math.max(...xs) + margem),
    y1: clamp01(Math.max(...ys) + margem),
  };
}

/** Diferença média por canal (0-255) fora da zona, medida em 64×64. Acima
 *  disso a cena foi reenquadrada e misturar criaria fantasma. Calibrar com o
 *  valor que `preservarFoto` registra no log em gerações reais. */
export const LIMIAR_DESALINHO = 32;

async function diferencaForaDaZona(a: Buffer, b: Buffer, z: ZonaFrac): Promise<number> {
  const L = 64;
  const ler = (buf: Buffer) => sharp(buf).resize(L, L, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [pa, pb] = await Promise.all([ler(a), ler(b)]);
  let soma = 0;
  let n = 0;
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const fx = (x + 0.5) / L;
      const fy = (y + 0.5) / L;
      if (fx >= z.x0 && fx <= z.x1 && fy >= z.y0 && fy <= z.y1) continue;
      const i = (y * L + x) * 3;
      soma += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
      n += 3;
    }
  }
  return n ? soma / n : 0;
}

export async function preservarFoto(
  original: Buffer,
  cena: Buffer,
  marcacao: Marcacao | null
): Promise<{ imagem: Buffer; aplicada: boolean }> {
  if (!marcacao) return { imagem: cena, aplicada: false };
  try {
    const meta = await sharp(cena).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return { imagem: cena, aplicada: false };

    const zona = zonaDaInstalacao(marcacao);
    // `.rotate()` aplica a orientação EXIF da foto do celular antes de comparar.
    const originalAjustada = await sharp(original).rotate().resize(W, H, { fit: "fill" }).removeAlpha().png().toBuffer();

    const diferenca = await diferencaForaDaZona(originalAjustada, cena, zona);
    console.log(`[preservarFoto] diferença fora da zona: ${diferenca.toFixed(1)} (limiar ${LIMIAR_DESALINHO})`);
    if (diferenca > LIMIAR_DESALINHO) return { imagem: cena, aplicada: false };

    const sigma = Math.max(1, Math.min(W, H) * 0.02);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<rect width="${W}" height="${H}" fill="#000"/>` +
      `<rect x="${zona.x0 * W}" y="${zona.y0 * H}" width="${(zona.x1 - zona.x0) * W}" height="${(zona.y1 - zona.y0) * H}" fill="#fff"/></svg>`;
    const mascara = await sharp(Buffer.from(svg)).blur(sigma).extractChannel(0).raw().toBuffer();
    // RGB cru primeiro: no mesmo pipeline, o sharp aplica `removeAlpha()` DEPOIS
    // do `joinChannel` e jogava a máscara fora.
    const cenaRgb = await sharp(cena).removeAlpha().raw().toBuffer();
    const cenaComAlfa = await sharp(cenaRgb, { raw: { width: W, height: H, channels: 3 } })
      .joinChannel(mascara, { raw: { width: W, height: H, channels: 1 } })
      .png()
      .toBuffer();
    const imagem = await sharp(originalAjustada).composite([{ input: cenaComAlfa }]).png().toBuffer();
    return { imagem, aplicada: true };
  } catch (err) {
    console.error("[preservarFoto] falhou, usando a cena:", err instanceof Error ? err.message : err);
    return { imagem: cena, aplicada: false };
  }
}
