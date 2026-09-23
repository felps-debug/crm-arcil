"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getUrgentFollowupsCount } from "@/lib/supabase/queries";

const REFRESH_EVERY_MS = 5 * 60 * 1000;
/** Tempo para o dashboard, se for a tela aberta, entregar a contagem do snapshot. */
const FIRST_CHECK_MS = 3000;

type UrgentFollowups = {
  count: number;
  /** O dashboard já recebe a contagem no snapshot; entrega aqui em vez de pedir de novo. */
  setFromSnapshot: (count: number) => void;
  refresh: () => void;
};

const UrgentFollowupsContext = createContext<UrgentFollowups>({
  count: 0,
  setFromSnapshot: () => {},
  refresh: () => {},
});

/**
 * Uma contagem de follow-ups urgentes para a sessão inteira.
 *
 * A sidebar e o dashboard buscavam o mesmo número cada um por conta própria,
 * ao mesmo tempo, e a sidebar ainda repetia a cada 5 minutos em toda tela.
 */
export function UrgentFollowupsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useCurrentUser();
  const [count, setCount] = useState(0);
  const inflight = useRef<Promise<void> | null>(null);
  const updatedAt = useRef(0);

  const refresh = useCallback(() => {
    if (inflight.current) return;
    inflight.current = getUrgentFollowupsCount()
      .then((n) => {
        updatedAt.current = Date.now();
        setCount(n);
      })
      .finally(() => {
        inflight.current = null;
      });
  }, []);

  const setFromSnapshot = useCallback((n: number) => {
    updatedAt.current = Date.now();
    setCount(n);
  }, []);

  // Só busca se ninguém atualizou o número há pouco. Abrindo direto no
  // dashboard, o snapshot já traz a contagem no primeiro segundo; buscar junto
  // seria a mesma consulta duas vezes em paralelo.
  const signedIn = Boolean(profile);
  useEffect(() => {
    if (!signedIn) return;
    const refreshIfOld = () => {
      if (Date.now() - updatedAt.current > REFRESH_EVERY_MS - 1000) refresh();
    };
    const first = setTimeout(refreshIfOld, FIRST_CHECK_MS);
    const id = setInterval(refreshIfOld, REFRESH_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [signedIn, refresh]);

  const value = useMemo(() => ({ count, setFromSnapshot, refresh }), [count, setFromSnapshot, refresh]);
  return <UrgentFollowupsContext.Provider value={value}>{children}</UrgentFollowupsContext.Provider>;
}

export function useUrgentFollowups() {
  return useContext(UrgentFollowupsContext);
}
