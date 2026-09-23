import { describe, expect, it } from "vitest";
import { parseBrowserTrace } from "./trace-validate";

const ok = {
  traceId: "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  journey: "dashboard",
  loadKind: "cold",
  stages: [
    { stage: "ttfb", durationMs: 120, outcome: "ok" },
    { stage: "ready", durationMs: 1400, outcome: "ok" },
  ],
};

describe("parseBrowserTrace", () => {
  it("aceita o payload do contrato", () => {
    expect(parseBrowserTrace(ok)).toEqual(ok);
  });

  it("recusa traceId que não é UUID v4", () => {
    expect(parseBrowserTrace({ ...ok, traceId: "abc" })).toBeNull();
    expect(parseBrowserTrace({ ...ok, traceId: "6f1c2b3a-4d5e-1f60-8a7b-9c0d1e2f3a4b" })).toBeNull();
  });

  it("recusa etapa fora da lista", () => {
    expect(parseBrowserTrace({ ...ok, stages: [{ stage: "auth", durationMs: 1, outcome: "ok" }] })).toBeNull();
  });

  it("recusa duração negativa ou absurda", () => {
    expect(parseBrowserTrace({ ...ok, stages: [{ stage: "ready", durationMs: -1, outcome: "ok" }] })).toBeNull();
    expect(parseBrowserTrace({ ...ok, stages: [{ stage: "ready", durationMs: 600_000, outcome: "ok" }] })).toBeNull();
  });

  it("recusa enum inválido", () => {
    expect(parseBrowserTrace({ ...ok, journey: "admin" })).toBeNull();
    expect(parseBrowserTrace({ ...ok, loadKind: "hot" })).toBeNull();
    expect(parseBrowserTrace({ ...ok, stages: [{ stage: "ready", durationMs: 1, outcome: "maybe" }] })).toBeNull();
  });

  it("recusa mais de 20 etapas e lista vazia", () => {
    const many = Array.from({ length: 21 }, () => ({ stage: "ready", durationMs: 1, outcome: "ok" }));
    expect(parseBrowserTrace({ ...ok, stages: many })).toBeNull();
    expect(parseBrowserTrace({ ...ok, stages: [] })).toBeNull();
  });

  it("descarta campos fora do contrato — nada de dado pessoal vindo do browser", () => {
    const parsed = parseBrowserTrace({
      ...ok,
      email: "alguem@x.com",
      userId: "outro-usuario",
      stages: [{ stage: "ready", durationMs: 10, outcome: "ok", phone: "5511999999999" }],
    });
    expect(parsed).toEqual({ ...ok, stages: [{ stage: "ready", durationMs: 10, outcome: "ok" }] });
  });

  it("arredonda a duração", () => {
    const parsed = parseBrowserTrace({ ...ok, stages: [{ stage: "ready", durationMs: 12.7, outcome: "ok" }] });
    expect(parsed?.stages[0].durationMs).toBe(13);
  });

  it("recusa o que nem é objeto", () => {
    expect(parseBrowserTrace(null)).toBeNull();
    expect(parseBrowserTrace("x")).toBeNull();
  });
});
