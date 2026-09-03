"use client";

import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; message: string; type: ToastType; }

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const STYLES = {
  success: "bg-emerald-600/90 text-white backdrop-blur-xl",
  error: "bg-red-600/90 text-white backdrop-blur-xl",
  warning: "bg-amber-500/90 text-white backdrop-blur-xl",
  info: "bg-slate-800/90 text-white backdrop-blur-xl",
};

export default function ToastViewport({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={cn("flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl shadow-[var(--shadow-xl)]", STYLES[t.type])}
            >
              <Icon size={16} className="flex-shrink-0 opacity-80" />
              <p className="text-sm font-medium flex-1">{t.message}</p>
              <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100 p-0.5 transition-opacity"><X size={14} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
