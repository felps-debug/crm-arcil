"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "arcil-sidebar";

const SidebarContext = createContext<{
  collapsed: boolean;
  toggle: () => void;
}>({ collapsed: false, toggle: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Começa expandida e só lê a preferência depois de montar. Ler o
  // localStorage no inicializador do useState faz o servidor renderizar
  // "expandida" e o cliente "recolhida" no mesmo passo, e o React acusa
  // divergência de hidratação.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "collapsed");
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "open");
      return next;
    });
  }, []);

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  return useContext(SidebarContext);
}
