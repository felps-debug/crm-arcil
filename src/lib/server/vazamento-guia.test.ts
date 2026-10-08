import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectarVazamentoDaGuia } from "./vazamento-guia";

const W = 400;
const H = 300;

const base = (cor: { r: number; g: number; b: number }) =>
  sharp({ create: { width: W, height: H, channels: 3, background: cor } });

const bloco = (w: number, h: number, cor: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: cor } }).png().toBuffer();

const CIANO = { r: 40, g: 200, b: 220 };
const MAGENTA = { r: 230, g: 20, b: 230 };
const PAREDE = { r: 200, g: 195, b: 185 };

describe("detectarVazamentoDaGuia", () => {
  it("acusa o retângulo magenta que não existia na foto", async () => {
    const foto = await base(PAREDE).png().toBuffer();
    const cena = await base(PAREDE).composite([{ input: await bloco(80, 6, MAGENTA), left: 150, top: 100 }]).png().toBuffer();
    expect(await detectarVazamentoDaGuia(cena, foto)).toBe(true);
  });

  it("não acusa vidro azulado que já estava na foto (alarme falso real de 2026-10-02)", async () => {
    const janela = await bloco(120, 100, CIANO);
    const foto = await base(PAREDE).composite([{ input: janela, left: 0, top: 80 }]).png().toBuffer();
    const cena = await base(PAREDE).composite([{ input: janela, left: 0, top: 80 }]).png().toBuffer();
    expect(await detectarVazamentoDaGuia(cena, foto)).toBe(false);
  });

  it("sem a foto para comparar, volta ao critério antigo", async () => {
    const cena = await base(PAREDE).composite([{ input: await bloco(80, 6, MAGENTA), left: 150, top: 100 }]).png().toBuffer();
    expect(await detectarVazamentoDaGuia(cena, null)).toBe(true);
  });
});
