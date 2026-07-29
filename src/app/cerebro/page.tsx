"use client";

import { Brain, Package, Sparkles, Wrench } from "lucide-react";
import { ConsoleCard, ConsolePage, ConsoleStatus } from "@/components/console/console-shell";

export default function CerebroPage() {
  return (
    <ConsolePage title="Cerebro Arcil" subtitle="IA com conhecimento total da operacao">
      <ConsoleCard className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-[14px] bg-violet-500/10 text-violet-300">
          <Brain size={26} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-center gap-2">
            <ConsoleStatus tone="violet">Em construcao</ConsoleStatus>
          </div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">O cerebro da Arcil esta chegando</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--text-muted)]">
            Uma IA com entendimento completo da operacao — produtos, conserto, defeitos e falhas conhecidas.
            Qualquer duvida tecnica ou operacional vai poder ser respondida direto por ela.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FeaturePreview icon={Package} label="Catalogo de produtos" />
          <FeaturePreview icon={Wrench} label="Conserto e defeitos" />
          <FeaturePreview icon={Sparkles} label="Respostas instantaneas" />
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}

function FeaturePreview({ icon: Icon, label }: { icon: typeof Package; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-inset)] px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
      <Icon size={15} className="text-[var(--text-muted)]" />
      {label}
    </div>
  );
}
