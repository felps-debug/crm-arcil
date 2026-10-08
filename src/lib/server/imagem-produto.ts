import sharp from "sharp";

/**
 * Recorta o branco em volta da foto de catálogo do ERP para o card MODELO.
 *
 * As fotos chegam com o kit pequeno no meio de um fundo branco grande; no card
 * da prancha o aparelho ficava minúsculo. Só para o card: o modelo de imagem e
 * o inspetor continuam recebendo a foto original.
 *
 * Recebe e devolve base64 JPEG sem o prefixo `data:`. Qualquer falha (ou uma
 * imagem toda branca, que o `trim` não consegue recortar) devolve a entrada.
 */
export async function recortarBordasBrancas(base64: string): Promise<string> {
  try {
    const original = Buffer.from(base64, "base64");
    const { data, info } = await sharp(original)
      .flatten({ background: "#ffffff" })
      .trim({ background: "#ffffff", threshold: 18 })
      .toBuffer({ resolveWithObject: true });
    const meta = await sharp(original).metadata();
    if (!info.width || !info.height || (info.width === meta.width && info.height === meta.height)) return base64;
    // Respiro de 6% do lado maior, para o aparelho não encostar na borda do card.
    const margem = Math.round(Math.max(info.width, info.height) * 0.06);
    const recortada = await sharp(data)
      .extend({ top: margem, bottom: margem, left: margem, right: margem, background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return recortada.toString("base64");
  } catch {
    return base64;
  }
}
