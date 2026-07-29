"use client";

import { useEffect, useState } from "react";

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!url) {
      return () => {
        alive = false;
      };
    }
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
    });

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        return body as T;
      })
      .then((body) => {
        if (!alive) return;
        setData(body);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [url]);

  return { data, loading, error };
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
