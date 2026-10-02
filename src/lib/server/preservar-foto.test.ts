import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { preservarFoto, zonaDaInstalacao } from "./preservar-foto";
import type { Marcacao } from "@/lib/marcacao";

const W = 400;
const H = 300;
const MARCACAO: Marcacao = { caixa: { x: 0.4, y: 0.2, w: 0.2, h: 0.1 }, rota: [{ x: 0.6, y: 0.25 }, { x: 0.8, y: 0.3 }] };

const liso = (r: number, g: number, b: number) =>
  sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer();

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("zonaDaInstalacao", () => {
  it("envolve caixa e rota, com margem, sem sair de 0..1", () => {
    const z = zonaDaInstalacao(MARCACAO, 0.1);
    expect(z.x0).toBeCloseTo(0.3);
    expect(z.x1).toBeCloseTo(0.9);
    expect(z.y0).toBeCloseTo(0.1);
    expect(z.y1).toBeCloseTo(0.4);
    const borda = zonaDaInstalacao({ caixa: { x: 0, y: 0, w: 0.1, h: 0.1 }, rota: [] }, 0.1);
    expect(borda.x0).toBe(0);
    expect(borda.y0).toBe(0);
  });
});

describe("preservarFoto", () => {
  it("fora da zona volta o pixel original; dentro fica a cena", async () => {
    const original = await liso(200, 200, 200);
    // Cena: a mesma parede, levemente diferente como o modelo devolve, com um "aparelho" vermelho na zona.
    const aparelho = await sharp({ create: { width: 60, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const cena = await sharp(await liso(196, 198, 202)).composite([{ input: aparelho, left: 170, top: 70 }]).png().toBuffer();
    const { imagem, aplicada } = await preservarFoto(original, cena, MARCACAO);
    expect(aplicada).toBe(true);
    expect(await pixel(imagem, 10, 290)).toEqual([200, 200, 200]);
    const [r, g] = await pixel(imagem, 200, 80);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(20);
  });

  it("cena desalinhada (muito diferente fora da zona) não é misturada", async () => {
    const { aplicada } = await preservarFoto(await liso(200, 200, 200), await liso(20, 60, 20), MARCACAO);
    expect(aplicada).toBe(false);
  });

  it("sem marcação devolve a cena", async () => {
    const { aplicada } = await preservarFoto(await liso(200, 200, 200), await liso(10, 10, 10), null);
    expect(aplicada).toBe(false);
  });
});
