"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ConsoleButton, ConsoleCard, ConsolePage } from "@/components/console/console-shell";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console (and, eventually, an error reporting service).
    console.error("[app-error]", error);
  }, [error]);

  return (
    <ConsolePage title="Algo deu errado" subtitle="Ocorreu um erro inesperado ao carregar esta página.">
      <ConsoleCard className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-red-500/25 bg-red-500/10 text-red-400">
          <AlertTriangle size={26} />
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Algo deu errado</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-muted)]">
            Tente novamente. Se o problema persistir, contate o suporte técnico.
          </p>
          {error.digest && (
            <p className="font-data mt-2 text-[11px] text-[var(--text-muted)]">Ref: {error.digest}</p>
          )}
        </div>
        <ConsoleButton onClick={() => reset()} icon={RefreshCw}>
          Tentar novamente
        </ConsoleButton>
      </ConsoleCard>
    </ConsolePage>
  );
}
