/* ================================================================
   ARCIL CRM — Hook genérico para queries Supabase
   Gerencia loading, error e data de forma padronizada
   ================================================================ */

"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { getView, load, subscribe } from "@/lib/api-cache";

interface UseSupabaseResult<T> {
  data: T | null;
  loading: boolean;
  /** True only while there is no data yet to show — false during a background
   * revalidation that already has previous data on screen. Use this (instead
   * of `loading`) to gate full-page/full-table spinners so a refetch doesn't
   * blank out content the user is looking at. */
  isInitialLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("A consulta demorou mais que 15 segundos.")), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/**
 * `useSupabase(key, fn, deps)`: resultado guardado em memória da aba com a
 * chave dada (lib/api-cache.ts) — voltar à tela mostra o último dado na hora.
 * `useSupabase(fn, deps)`: sem cache, como sempre foi.
 */
export function useSupabase<T>(key: string, queryFn: () => Promise<T>, deps?: unknown[]): UseSupabaseResult<T>;
export function useSupabase<T>(queryFn: () => Promise<T>, deps?: unknown[]): UseSupabaseResult<T>;
export function useSupabase<T>(
  a: string | (() => Promise<T>),
  b?: (() => Promise<T>) | unknown[],
  c?: unknown[]
): UseSupabaseResult<T> {
  const key = typeof a === "string" ? a : null;
  const queryFn = (typeof a === "string" ? b : a) as () => Promise<T>;
  const deps = ((typeof a === "string" ? c : b) as unknown[] | undefined) ?? [];

  const cached = useCachedQuery<T>(key, queryFn, deps);
  const uncached = useUncachedQuery<T>(key ? null : queryFn, deps);
  return key ? cached : uncached;
}

function useCachedQuery<T>(key: string | null, queryFn: () => Promise<T>, deps: unknown[]): UseSupabaseResult<T> {
  const fnRef = useRef(queryFn);
  useEffect(() => {
    fnRef.current = queryFn;
  });

  const view = useSyncExternalStore(
    (cb) => (key ? subscribe(key, cb) : () => {}),
    () => getView<T>(key ?? ""),
    () => getView<T>(key ?? "")
  );

  const run = useCallback(
    (force: boolean) => {
      if (!key) return;
      void load(key, () => withTimeout(fnRef.current()), { force });
    },
    [key]
  );

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  const loading = view.loading || (view.fetchedAt === null && view.data === null && !view.error);
  return {
    data: view.data,
    loading,
    isInitialLoading: loading && view.data === null,
    error: view.error,
    refetch: () => run(true),
  };
}

function useUncachedQuery<T>(queryFn: (() => Promise<T>) | null, deps: unknown[]): UseSupabaseResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!queryFn) return;
    try {
      setLoading(true);
      setError(null);
      setData(await withTimeout(queryFn()));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setError(message);
      console.error("[useSupabase]", message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, isInitialLoading: loading && data === null, error, refetch: fetch };
}
