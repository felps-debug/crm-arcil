import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey, clearApiCache, getView, invalidate, load, subscribe } from "./api-cache";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
  clearApiCache();
});
afterEach(() => vi.useRealTimers());

describe("cacheKey", () => {
  it("ignora o parâmetro _r, que só servia para forçar refetch", () => {
    expect(cacheKey("/api/leads?status=ACTIVE&_r=3")).toBe("/api/leads?status=ACTIVE");
    expect(cacheKey("/api/dashboard/snapshot?_r=1")).toBe("/api/dashboard/snapshot");
  });
});

describe("store de tela", () => {
  it("entrada fresca não dispara fetch", async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await load("k", fetcher);
    vi.setSystemTime(new Date("2026-09-22T12:00:29Z"));
    await load("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("entrada velha devolve o dado na hora e revalida", async () => {
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length }));
    await load("k", fetcher);
    vi.setSystemTime(new Date("2026-09-22T12:00:31Z"));
    const pending = load("k", fetcher);
    expect(getView("k").data).toEqual({ n: 1 });
    expect(getView("k").loading).toBe(true);
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(getView("k").data).toEqual({ n: 2 });
  });

  it("duas telas pedindo a mesma chave compartilham a request em voo", async () => {
    const d = deferred<number>();
    const fetcher = vi.fn(() => d.promise);
    const a = load("k", fetcher);
    const b = load("k", fetcher);
    d.resolve(7);
    await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("resposta antiga que chega depois de uma mais nova é descartada", async () => {
    const primeira = deferred<string>();
    const segunda = deferred<string>();
    const p1 = load("k", () => primeira.promise);
    const p2 = load("k", () => segunda.promise, { force: true });
    segunda.resolve("nova");
    await p2;
    primeira.resolve("velha");
    await p1;
    expect(getView("k").data).toBe("nova");
  });

  it("falha na revalidação mantém o dado e marca como desatualizado", async () => {
    await load("k", async () => "ok");
    await load("k", async () => { throw new Error("rede fora"); }, { force: true });
    const view = getView("k");
    expect(view.data).toBe("ok");
    expect(view.error).toBe("rede fora");
    expect(view.isStale).toBe(true);
  });

  it("falha sem dado anterior não é 'desatualizado', é erro", async () => {
    await load("k", async () => { throw new Error("rede fora"); });
    expect(getView("k").isStale).toBe(false);
    expect(getView("k").error).toBe("rede fora");
  });

  it("invalidate revalida quem está na tela e marca o resto para a próxima visita", async () => {
    const naTela = vi.fn(async () => "a");
    const foraDaTela = vi.fn(async () => "b");
    await load("/api/leads?x=1", naTela);
    await load("/api/leads/9", foraDaTela);
    const unsubscribe = subscribe("/api/leads?x=1", () => {});

    invalidate((key) => key.startsWith("/api/leads"));
    await flush();
    expect(naTela).toHaveBeenCalledTimes(2);
    expect(foraDaTela).toHaveBeenCalledTimes(1);

    await load("/api/leads/9", foraDaTela);
    expect(foraDaTela).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("assinante é avisado a cada mudança", async () => {
    const cb = vi.fn();
    subscribe("k", cb);
    await load("k", async () => 1);
    expect(cb).toHaveBeenCalled();
  });

  it("clearApiCache esvazia tudo (logout)", async () => {
    await load("k", async () => 1);
    clearApiCache();
    expect(getView("k").data).toBeNull();
  });

  it("nunca toca em armazenamento persistente do navegador", async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    await load("k", async () => ({ lead: "dado pessoal" }));
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
