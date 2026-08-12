/* ================================================================
   ARCIL CRM — Hook genérico para queries Supabase
   Gerencia loading, error e data de forma padronizada
   ================================================================ */

"use client";

import { useState, useEffect, useCallback } from "react";

interface UseSupabaseResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSupabase<T>(
  queryFn: () => Promise<T>,
  deps: unknown[] = []
): UseSupabaseResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      setLoading(true);
      setError(null);
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("A consulta demorou mais que 15 segundos.")), { once: true });
        }),
      ]);
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setError(message);
      console.error("[useSupabase]", message);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
