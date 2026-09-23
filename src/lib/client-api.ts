"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { cacheKey, getView, load, subscribe, type CacheView } from "@/lib/api-cache";

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("A consulta demorou mais que 15 segundos. Tente atualizar.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

// Sem URL a tela ainda não sabe o que pedir (ex.: drawer sem item escolhido).
const NO_URL_VIEW: CacheView = { data: null, loading: true, error: null, isStale: false, fetchedAt: null };
const noopSubscribe = () => () => {};

/**
 * Dado de uma rota /api, reaproveitado entre telas (ver lib/api-cache.ts).
 *
 * Voltar a uma tela mostra o último dado válido na hora; se ele tem mais de
 * 30s, atualiza em segundo plano sem apagar a tela. `isInitialLoading` só é
 * true quando não há nada para mostrar — é ele que decide o skeleton.
 *
 * Trocar `_r` na URL (padrão antigo de "atualizar") continua forçando refetch.
 */
export function useApi<T>(url: string | null, opts?: { freshMs?: number; headers?: HeadersInit }) {
  const key = url ? cacheKey(url) : null;
  const lastUrl = useRef<string | null>(null);
  const headersRef = useRef(opts?.headers);
  // Declarado antes do efeito que dispara a request, então roda antes dele.
  useEffect(() => {
    headersRef.current = opts?.headers;
  });

  const view = useSyncExternalStore(
    key ? (cb) => subscribe(key, cb) : noopSubscribe,
    () => (key ? getView<T>(key) : (NO_URL_VIEW as CacheView<T>)),
    () => (key ? getView<T>(key) : (NO_URL_VIEW as CacheView<T>))
  );

  const run = useCallback(
    (force: boolean) => {
      if (!url || !key) return;
      void load(key, () => fetchJson<T>(url, { headers: headersRef.current }), { freshMs: opts?.freshMs, force });
    },
    [url, key, opts?.freshMs]
  );

  useEffect(() => {
    // Mesma chave com `_r` diferente = alguém apertou "atualizar".
    const forced = Boolean(url && lastUrl.current && url !== lastUrl.current && cacheKey(lastUrl.current) === key);
    lastUrl.current = url;
    run(forced);
  }, [url, key, run]);

  const neverLoaded = Boolean(key) && view.fetchedAt === null && view.data === null && !view.error;
  const loading = view.loading || neverLoaded || (!key && NO_URL_VIEW.loading);

  return {
    data: view.data,
    loading,
    isInitialLoading: loading && view.data === null,
    error: view.error,
    isStale: view.isStale,
    revalidate: () => run(true),
  };
}

export function formatNumber(value: number | string | null | undefined) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatMoney(value: number | string | null | undefined) {
  if (value == null) return "R$ 0,00";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
