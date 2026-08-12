"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { ConsoleCard, ConsoleStatus } from "@/components/console/console-shell";
import type { LeadDetailResponse } from "@/types/api";

/**
 * Aviso de leitura, não formulário.
 *
 * A decisão financeira (baixar boleto, devolver ao bot, programar retorno) vive
 * inteira em /cobranca → "Atendimentos financeiros". Antes ela existia aqui
 * também, com regra de liberação DIFERENTE da do board: aqui bastava
 * `handoff_accepted_at`, lá era preciso estar na coluna "em atendimento
 * humano". O mesmo boleto ficava editável num lugar e bloqueado no outro, com
 * dois caminhos de escrita para o mesmo estado.
 *
 * Quem abre o lead precisa SABER que ele está em cobrança; quem decide é o
 * financeiro, na tela que modela os quatro estados do atendimento.
 */
function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function FinancialHandoffCard({ detail }: { detail: LeadDetailResponse }) {
  const handoff = detail.financialHandoff;
  if (!handoff?.eligible) return null;

  const boletos: { empresa: string; documento: string; valor: number }[] = handoff.boletos ?? [];
  const openAmount = boletos.reduce((sum, boleto) => sum + boleto.valor, 0);
  const decided = new Set(
    (handoff.activeDecisions ?? []).map(
      (decision: { empresa: string; documento: string }) => `${decision.empresa} ${decision.documento}`
    )
  );
  const pending = boletos.filter((boleto) => !decided.has(`${boleto.empresa} ${boleto.documento}`));

  return (
    <ConsoleCard className="mt-5 border-amber-500/30 bg-amber-500/[0.04]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-[8px] bg-amber-500/10 p-2" style={{ color: "var(--amber)" }}>
          <ShieldAlert size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Em atendimento financeiro</h3>
            <ConsoleStatus tone="amber">{pending.length} em aberto</ConsoleStatus>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {boletos.length} boleto{boletos.length === 1 ? "" : "s"} somando {formatCurrency(openAmount)}. As baixas e a
            devolução ao bot são feitas em Cobranças.
          </p>

          {boletos.length > 0 && (
            <div className="mt-3 max-h-[132px] space-y-1.5 overflow-y-auto pr-1">
              {boletos.map((boleto) => {
                const settled = decided.has(`${boleto.empresa} ${boleto.documento}`);
                return (
                  <div
                    key={`${boleto.empresa}-${boleto.documento}`}
                    className="flex items-center justify-between gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">
                      {boleto.documento}
                      <span className="text-[var(--text-muted)]"> · {boleto.empresa}</span>
                    </span>
                    <span className="font-data shrink-0 text-[11px] font-bold text-[var(--text-primary)]">
                      {formatCurrency(boleto.valor)}
                    </span>
                    <ConsoleStatus tone={settled ? "green" : "slate"}>{settled ? "Baixado" : "Aberto"}</ConsoleStatus>
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href="/cobranca"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold underline-offset-4 hover:underline"
            style={{ color: "var(--amber)" }}
          >
            Abrir em Cobranças
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </ConsoleCard>
  );
}
