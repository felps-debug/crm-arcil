"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { ConsoleButton, ConsoleCard, ConsoleStatus } from "@/components/console/console-shell";
import type { FinancialHandoffDestination, FinancialHandoffDecisionStatus } from "@/lib/server/financial-handoff";
import type { LeadDetailResponse } from "@/types/api";

type BoletoChoice = "em_aberto" | FinancialHandoffDecisionStatus;

type FinancialHandoffCardProps = {
  detail: LeadDetailResponse;
  onSaved: () => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function boletoKey(empresa: string, documento: string) {
  return `${empresa}\u0000${documento}`;
}

export function FinancialHandoffCard({ detail, onSaved }: FinancialHandoffCardProps) {
  const handoff = detail.financialHandoff;
  const [choices, setChoices] = useState<Record<string, BoletoChoice>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<FinancialHandoffDestination>("devolver_ao_bot");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handoff) return;
    const nextChoices: Record<string, BoletoChoice> = {};
    const nextNotes: Record<string, string> = {};
    for (const decision of handoff.activeDecisions) {
      const key = boletoKey(decision.empresa, decision.documento);
      nextChoices[key] = decision.status;
      if (decision.note) nextNotes[key] = decision.note;
    }
    setChoices(nextChoices);
    setNotes(nextNotes);
    setDestination("devolver_ao_bot");
    setError(null);
  }, [handoff]);

  const visibleHandoff = handoff?.eligible ? handoff : null;
  const invalidRenegotiation = useMemo(() => visibleHandoff?.boletos.some((boleto) => {
    const key = boletoKey(boleto.empresa, boleto.documento);
    return choices[key] === "renegociado" && !notes[key]?.trim();
  }) ?? false, [choices, notes, visibleHandoff]);

  if (!visibleHandoff) return null;

  async function handleSubmit() {
    const handoffToSubmit = visibleHandoff;
    if (!handoffToSubmit || !handoffToSubmit.cobrancaLogId || saving || invalidRenegotiation) return;
    setSaving(true);
    setError(null);

    const decisions = handoffToSubmit.boletos.flatMap((boleto) => {
      const key = boletoKey(boleto.empresa, boleto.documento);
      const status = choices[key];
      return status === "pago" || status === "renegociado"
        ? [{ empresa: boleto.empresa, documento: boleto.documento, status, note: notes[key]?.trim() || null }]
        : [];
    });

    try {
      const response = await fetch(`/api/leads/${detail.lead.id}/financial-handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobrancaLogId: handoffToSubmit.cobrancaLogId, destination, decisions }),
      });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || body?.ok !== true) {
        setError(body?.error ?? "Não foi possível salvar o encerramento financeiro.");
        return;
      }
      onSaved();
    } catch {
      setError("Falha de conexão. A decisão não foi confirmada; tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleCard className="mt-5 border-amber-500/30 bg-amber-500/[0.04em]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-[8px] bg-amber-500/10 p-2 text-amber-300"><ShieldAlert size={16} /></div>
        <div>
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Finalizar atendimento financeiro</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Boletos marcados como pagos ou renegociados não serão cobrados pela IA enquanto o ERP atualiza.
          </p>
        </div>
      </div>

      {!visibleHandoff.cobrancaLogId || visibleHandoff.boletos.length === 0 ? (
        <p className="mt-4 rounded-[8px] border border-amber-500/20 bg-amber-500/5 p-3 text-[12px] text-amber-200">
          Nenhum boleto foi encontrado no último disparo deste cliente. Não devolva este atendimento ao bot até atualizar a cobrança.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {visibleHandoff.boletos.map((boleto) => {
              const key = boletoKey(boleto.empresa, boleto.documento);
              const choice = choices[key] ?? "em_aberto";
              return (
                <div key={key} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-[var(--text-primary)]">{boleto.documento}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {boleto.empresa} · {formatCurrency(boleto.valor)}{boleto.vencimento ? ` · vence ${boleto.vencimento}` : ""}
                      </p>
                    </div>
                    <select
                      aria-label={`Situação do boleto ${boleto.documento}`}
                      value={choice}
                      onChange={(event) => setChoices((current) => ({ ...current, [key]: event.target.value as BoletoChoice }))}
                      className="shrink-0 rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] outline-none focus:border-blue-500"
                    >
                      <option value="em_aberto">Manter em aberto</option>
                      <option value="pago">Pago</option>
                      <option value="renegociado">Renegociado</option>
                    </select>
                  </div>
                  {choice === "renegociado" && (
                    <textarea
                      value={notes[key] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="Ex.: parcelado em 3x, primeira parcela em 15/08"
                      rows={2}
                      className="mt-3 w-full resize-none rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <fieldset className="mt-4">
            <legend className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Próximo passo</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                ["devolver_ao_bot", "Devolver ao bot"],
                ["sem_retorno", "Sem retorno"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)]">
                  <input type="radio" name="financial-handoff-destination" value={value} checked={destination === value} onChange={() => setDestination(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {invalidRenegotiation && <p className="mt-3 text-[11px] font-semibold text-red-300">Informe a observação de cada boleto renegociado.</p>}
          {error && <p className="mt-3 text-[11px] font-semibold text-red-300">{error}</p>}

          <ConsoleButton className="mt-4 w-full" disabled={saving || invalidRenegotiation} onClick={handleSubmit} icon={CheckCircle2}>
            {saving ? "Salvando..." : "Confirmar encerramento"}
          </ConsoleButton>
          <div className="mt-3"><ConsoleStatus tone="amber">Handoff humano assumido</ConsoleStatus></div>
        </>
      )}
    </ConsoleCard>
  );
}
