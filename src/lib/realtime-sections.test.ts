import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSectionBatcher, SECTION_DEPENDENCIES, sectionsFor } from "./realtime-sections";

describe("sectionsFor", () => {
  it("conversa nova não recarrega pendências, estoque nem atividade", () => {
    expect(sectionsFor("conversations")).toEqual(["agents", "summary"]);
  });

  it("lead mexe em resumo, pendências, agentes e atividade", () => {
    expect(sectionsFor("leads")).toEqual(["activity", "agents", "pending", "summary"]);
  });

  it("follow-up também atualiza a contagem urgente", () => {
    expect(sectionsFor("followups")).toContain("urgentFollowups");
  });

  it("cobrança mexe em resumo, pendências e atividade", () => {
    expect(sectionsFor("cobranca_log")).toEqual(["activity", "pending", "summary"]);
  });

  it("estoque nunca é invalidado por realtime (produtos não estão na publicação)", () => {
    for (const secoes of Object.values(SECTION_DEPENDENCIES)) expect(secoes).not.toContain("inventory");
  });

  it("tabela desconhecida não pede nada", () => {
    expect(sectionsFor("prospeccoes")).toEqual([]);
  });
});

describe("createSectionBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("agrupa eventos da janela em um flush só, com a união das seções", () => {
    const onFlush = vi.fn();
    const batcher = createSectionBatcher(onFlush, 2000);
    batcher.add("leads");
    vi.advanceTimersByTime(700);
    batcher.add("conversations");
    vi.advanceTimersByTime(800);
    batcher.add("leads");
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["activity", "agents", "pending", "summary"]);
  });

  it("a janela conta do primeiro evento: um fluxo contínuo não adia o flush para sempre", () => {
    const onFlush = vi.fn();
    const batcher = createSectionBatcher(onFlush, 2000);
    for (let i = 0; i < 10; i++) {
      batcher.add("followups");
      vi.advanceTimersByTime(500);
    }
    expect(onFlush.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("dispose antes do fim da janela não dispara nada", () => {
    const onFlush = vi.fn();
    const batcher = createSectionBatcher(onFlush, 2000);
    batcher.add("leads");
    batcher.dispose();
    vi.advanceTimersByTime(5000);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("evento de tabela sem seção não abre janela", () => {
    const onFlush = vi.fn();
    const batcher = createSectionBatcher(onFlush, 2000);
    batcher.add("prospeccoes");
    vi.advanceTimersByTime(5000);
    expect(onFlush).not.toHaveBeenCalled();
  });
});
