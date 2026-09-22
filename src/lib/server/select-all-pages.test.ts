import { describe, expect, it, vi } from "vitest";
import { MAX_ROWS, PAGE_SIZE, RowLimitExceededError, selectAllPages } from "./select-all-pages";

/** Simula o PostgREST: devolve no máximo PAGE_SIZE linhas por chamada. */
function fakeTable(total: number, failOnCall?: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ n: i }));
  let calls = 0;
  const build = vi.fn(async (from: number, to: number) => {
    calls += 1;
    if (calls === failOnCall) return { data: null, error: new Error("falhou na página") };
    return { data: rows.slice(from, to + 1), error: null };
  });
  return build;
}

describe("selectAllPages", () => {
  it("percorre todas as páginas acima do corte de 1.000 linhas, na ordem", async () => {
    const build = fakeTable(2_500);
    const rows = await selectAllPages(build);
    expect(build).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(2_500);
    expect(rows[0]).toEqual({ n: 0 });
    expect(rows[2_499]).toEqual({ n: 2_499 });
    expect(build).toHaveBeenNthCalledWith(2, PAGE_SIZE, 2 * PAGE_SIZE - 1);
  });

  it("tabela vazia faz uma chamada e devolve lista vazia", async () => {
    const build = fakeTable(0);
    expect(await selectAllPages(build)).toEqual([]);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("exatamente uma página cheia precisa de uma segunda chamada para saber que acabou", async () => {
    const build = fakeTable(PAGE_SIZE);
    expect(await selectAllPages(build)).toHaveLength(PAGE_SIZE);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("erro em qualquer página rejeita, em vez de devolver o que já veio", async () => {
    await expect(selectAllPages(fakeTable(2_500, 2))).rejects.toThrow("falhou na página");
  });

  it("acima do teto lança erro nomeado em vez de truncar", async () => {
    await expect(selectAllPages(fakeTable(MAX_ROWS + 1))).rejects.toBeInstanceOf(RowLimitExceededError);
  });
});
