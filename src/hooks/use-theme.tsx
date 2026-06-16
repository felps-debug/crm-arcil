"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("arcil-theme") as Theme | null;
    if (stored === "dark") {
      // Intencional: localStorage só existe no client. Mantemos o estado inicial
      // em "light" (igual ao SSR) e só ajustamos aqui, depois de montar, pra não
      // gerar mismatch de hidratação entre servidor e cliente.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("arcil-theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
