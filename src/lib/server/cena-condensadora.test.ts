import { describe, expect, it } from "vitest";
import { chaveCacheCondensadora } from "./cena-condensadora";

describe("chaveCacheCondensadora", () => {
  it("mesmo produto e local dão a mesma chave e a mesma URL pública", () => {
    const a = chaveCacheCondensadora("3035C", "telhado");
    expect(a).toEqual(chaveCacheCondensadora("3035C", "telhado"));
    expect(a?.leadId).toBe("cache-3035c");
    // O n8n grava em PDF/condensadora-{lead_id}-{tipo_local}.
    expect(a?.url).toMatch(/\/storage\/v1\/object\/public\/PDF\/condensadora-cache-3035c-telhado$/);
  });

  it("locais diferentes não se misturam", () => {
    expect(chaveCacheCondensadora("3035C", "telhado")?.url).not.toBe(chaveCacheCondensadora("3035C", "chao")?.url);
  });

  it("limpa o código para virar caminho de arquivo, e sem código não há cache", () => {
    expect(chaveCacheCondensadora(" AB/12 x#3 ", "chao")?.leadId).toBe("cache-ab-12-x-3");
    expect(chaveCacheCondensadora("", "chao")).toBeNull();
    expect(chaveCacheCondensadora(undefined, "chao")).toBeNull();
  });
});
