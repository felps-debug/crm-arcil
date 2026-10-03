import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { recortarBordasBrancas } from "./imagem-produto";

describe("recortarBordasBrancas", () => {
  it("tira o branco em volta do aparelho e deixa uma margem pequena", async () => {
    // Foto de catálogo típica: 800x600 branco com o aparelho (200x100) no meio.
    const aparelho = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#8a8f96" } }).png().toBuffer();
    const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } })
      .composite([{ input: aparelho, left: 300, top: 250 }])
      .jpeg()
      .toBuffer();
    const recortada = await recortarBordasBrancas(foto.toString("base64"));
    const meta = await sharp(Buffer.from(recortada, "base64")).metadata();
    expect(meta.width).toBeLessThan(260);
    expect(meta.width).toBeGreaterThanOrEqual(200);
    expect(meta.height).toBeLessThan(160);
  });

  it("imagem toda branca (ou que falha) volta como veio", async () => {
    const branca = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const b64 = branca.toString("base64");
    expect(await recortarBordasBrancas(b64)).toBe(b64);
    expect(await recortarBordasBrancas("não é imagem")).toBe("não é imagem");
  });
});
