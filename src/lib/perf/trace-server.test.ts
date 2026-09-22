import { describe, expect, it } from "vitest";
import { countSupabaseRequest, currentTrace, readTraceId, serverTimingHeader, timeStage, withTrace } from "./trace-server";

describe("contexto de traço", () => {
  it("conta requests ao Supabase dentro do traço", async () => {
    await withTrace("t1", async () => {
      countSupabaseRequest();
      await Promise.resolve();
      countSupabaseRequest();
      await Promise.all([Promise.resolve().then(countSupabaseRequest)]);
      expect(currentTrace()?.supabaseRequests).toBe(3);
    });
  });

  it("fora de um traço não lança nem conta", () => {
    expect(() => countSupabaseRequest()).not.toThrow();
    expect(currentTrace()).toBeUndefined();
  });

  it("timeStage registra a etapa e devolve o resultado, mesmo quando falha", async () => {
    await withTrace("t2", async () => {
      expect(await timeStage("core", async () => 42)).toBe(42);
      await expect(timeStage("products", async () => { throw new Error("x"); })).rejects.toThrow("x");
      const stages = currentTrace()!.stages;
      expect(stages.map((s) => [s.stage, s.outcome])).toEqual([["core", "ok"], ["products", "error"]]);
      expect(stages.every((s) => s.durationMs >= 0 && Number.isInteger(s.durationMs))).toBe(true);
    });
  });

  it("dois traços em paralelo não se misturam", async () => {
    const a = withTrace("a", async () => { countSupabaseRequest(); await new Promise((r) => setTimeout(r, 5)); return currentTrace()!.supabaseRequests; });
    const b = withTrace("b", async () => { countSupabaseRequest(); countSupabaseRequest(); return currentTrace()!.supabaseRequests; });
    expect(await Promise.all([a, b])).toEqual([1, 2]);
  });
});

describe("serverTimingHeader", () => {
  it("formata no padrão Server-Timing", () => {
    expect(serverTimingHeader([{ stage: "auth", durationMs: 12, outcome: "ok" }, { stage: "total", durationMs: 170, outcome: "ok" }]))
      .toBe("auth;dur=12, total;dur=170");
  });

  it("troca caractere que o header não aceita no nome", () => {
    expect(serverTimingHeader([{ stage: "section:pending", durationMs: 3, outcome: "ok" }])).toBe("section_pending;dur=3");
  });
});

describe("readTraceId", () => {
  it("usa o id do browser quando é UUID v4", () => {
    const id = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(readTraceId(new Request("http://x", { headers: { "x-trace-id": id } }))).toBe(id);
  });

  it("gera um novo quando o header falta ou é inválido", () => {
    const gerado = readTraceId(new Request("http://x", { headers: { "x-trace-id": "'; drop table" } }));
    expect(gerado).toMatch(/^[0-9a-f-]{36}$/);
  });
});
