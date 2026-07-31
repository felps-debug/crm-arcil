import Link from "next/link";
import { Home, SearchX } from "lucide-react";
import { ConsoleCard, ConsolePage } from "@/components/console/console-shell";

export default function NotFound() {
  return (
    <ConsolePage title="Página não encontrada" subtitle="O recurso solicitado não existe ou foi removido.">
      <ConsoleCard className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-400">
          <SearchX size={26} />
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Página não encontrada</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--text-muted)]">
            Verifique o endereço digitado ou volte para o início.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:border-blue-500/50 hover:text-[var(--text-primary)]"
        >
          <Home size={14} />
          Voltar para o início
        </Link>
      </ConsoleCard>
    </ConsolePage>
  );
}
