"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import dynamic from "next/dynamic";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; message: string; type: ToastType; }
interface ToastCtx { toast: (message: string, type?: ToastType) => void; }

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export function useToast() { return useContext(Ctx); }

// framer-motion (via ToastViewport) used to load on every route — including
// /login, before any toast ever fires — just to animate a list that's empty
// 99% of the time. Loading it only once the first toast actually fires keeps
// it off the critical path without losing the exit animation: once mounted,
// the viewport stays mounted so AnimatePresence can still animate the last
// toast out.
const ToastViewport = dynamic(() => import("./toast-viewport"), { ssr: false });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewportLoaded, setViewportLoaded] = useState(false);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).slice(2);
    setViewportLoaded(true);
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const remove = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {viewportLoaded && <ToastViewport toasts={toasts} remove={remove} />}
    </Ctx.Provider>
  );
}
