"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ConsoleButton, ConsoleCard, ConsoleError, ConsoleLoading, ConsoleStatus } from "@/components/console/console-shell";
import { createClient } from "@/lib/supabase/client";
import type { FinancialBoardColumn, FinancialBoardItem, FinancialHandoffDecisionStatus } from "@/lib/server/financial-handoff";

type Choice = "em_aberto" | FinancialHandoffDecisionStatus;
type BoardResponse = { items?: FinancialBoardItem[]; error?: string };

const columns: { id: FinancialBoardColumn; label: string; empty: string }[] = [
  { id: "awaiting_response", label: "Aguardando resposta", empty: "Nenhuma cobrança aguardando resposta." },
  { id: "human", label: "Em atendimento humano", empty: "Nenhum atendimento humano ativo." },
  { id: "awaiting_return", label: "Aguardando retorno", empty: "Nenhuma retomada programada." },
  { id: "resolved", label: "Resolvido", empty: "Nenhum atendimento resolvido recentemente." },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function key(empresa: string, documento: string) {
  return `${empresa}\u0000${documento}`;
}

function returnDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
}

export function FinancialHandoffBoard() {
  const [items, setItems] = useState<FinancialBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cobranca/financial-handoffs", { cache: "no-store" });
      const body = await response.json().catch(() => null) as BoardResponse | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar os atendimentos financeiros.");
      setItems(body?.items ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os atendimentos financeiros.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase.channel("financial-handoff-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_handoff_resolutions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_handoff_boleto_decisions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const grouped = useMemo(() => new Map(columns.map((column) => [column.id, items.filter((item) => item.column === column.id)])), [items]);

  if (loading && !items.length) return <ConsoleLoading />;
  if (error && !items.length) return <ConsoleError message={error} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Atendimentos financeiros</h2>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Feche boleto por boleto sem abrir Leads ou o Kanban geral.</p>
        </div>
        <button onClick={load} className="rounded-[8px] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Atualizar atendimentos">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error && <ConsoleError message={error} />}
      <div className="grid gap-3 xl:grid-cols-4">
        {columns.map((column) => {
          const columnItems = grouped.get(column.id) ?? [];
          return <section key={column.id} className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{column.label}</h3>
              <span className="font-data text-[11px] text-[var(--text-muted)]">{columnItems.length}</span>
            </div>
            <div className="space-y-2">
              {columnItems.map((item) => <FinancialCard key={item.leadId} item={item} onSaved={load} />)}
              {!columnItems.length && <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">{column.empty}</p>}
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}

function FinancialCard({ item, onSaved }: { item: FinancialBoardItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<"devolver_ao_bot" | "sem_retorno">("devolver_ao_bot");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = item.column === "human" && Boolean(item.cobrancaLogId) && item.boletos.length > 0;
  const scheduledDate = returnDate(item.followupAt);

  const invalidRenegotiation = item.boletos.some((boleto) => choices[key(boleto.empresa, boleto.documento)] === "renegociado" && !notes[key(boleto.empresa, boleto.documento)]?.trim());

  async function submit() {
    if (!item.cobrancaLogId || saving || invalidRenegotiation) return;
    setSaving(true);
    setError(null);
    const decisions = item.boletos.flatMap((boleto) => {
      const boletoChoice = choices[key(boleto.empresa, boleto.documento)];
      return boletoChoice === "pago" || boletoChoice === "renegociado"
        ? [{ empresa: boleto.empresa, documento: boleto.documento, status: boletoChoice, note: notes[key(boleto.empresa, boleto.documento)]?.trim() || null }]
        : [];
    });
    try {
      const response = await fetch(`/api/leads/${item.leadId}/financial-handoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobrancaLogId: item.cobrancaLogId, destination, decisions }),
      });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? "Não foi possível salvar o atendimento.");
      setOpen(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o atendimento.");
    } finally {
      setSaving(false);
    }
  }

  return <ConsoleCard pad={false} className="overflow-hidden border-[var(--border)] bg-[var(--bg-surface)]">
    <button onClick={() => editable && setOpen((current) => !current)} disabled={!editable} className="w-full p-3 text-left disabled:cursor-default">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-[12px] font-bold text-[var(--text-primary)]">{item.name ?? "Sem nome"}</p><p className="mt-0.5 font-data text-[10px] text-[var(--text-muted)]">{item.phone}</p></div>
        {editable && <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2"><div><p className="font-data text-[14px] font-bold text-[var(--text-primary)]">{money(item.openAmount)}</p><p className="text-[10px] text-[var(--text-muted)]">{item.openBoletoCount} boleto{item.openBoletoCount !== 1 ? "s" : ""} em aberto</p></div>{scheduledDate && <ConsoleStatus tone="amber">Retoma {scheduledDate}</ConsoleStatus>}</div>
    </button>
    <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[var(--border)]"><div className="space-y-2 p-3">
      {item.boletos.map((boleto) => { const boletoKey = key(boleto.empresa, boleto.documento); const choice = choices[boletoKey] ?? "em_aberto"; return <div key={boletoKey} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5"><div className="flex gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[var(--text-primary)]">{boleto.documento}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{boleto.empresa} · {money(boleto.valor)}</p></div><select value={choice} onChange={(event) => setChoices((current) => ({ ...current, [boletoKey]: event.target.value as Choice }))} className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text-primary)]"><option value="em_aberto">Em aberto</option><option value="pago">Pago</option><option value="renegociado">Renegociado</option></select></div>{choice === "renegociado" && <textarea value={notes[boletoKey] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [boletoKey]: event.target.value }))} rows={2} placeholder="Condições da renegociação" className="mt-2 w-full resize-none rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-[10px] text-[var(--text-primary)]" />}</div>; })}
      <div className="grid grid-cols-2 gap-2 pt-1"><label className="rounded-[7px] border border-[var(--border)] px-2 py-2 text-[10px] font-semibold text-[var(--text-secondary)]"><input className="mr-1.5" type="radio" checked={destination === "devolver_ao_bot"} onChange={() => setDestination("devolver_ao_bot")} />Bot agora</label><label className="rounded-[7px] border border-[var(--border)] px-2 py-2 text-[10px] font-semibold text-[var(--text-secondary)]"><input className="mr-1.5" type="radio" checked={destination === "sem_retorno"} onChange={() => setDestination("sem_retorno")} />Sem retorno</label></div>
      {destination === "sem_retorno" && <p className="text-[10px] text-amber-300">O bot retoma somente em três dias úteis, se ainda houver boleto aberto.</p>}
      {invalidRenegotiation && <p className="text-[10px] font-semibold text-red-300">Informe a condição de cada renegociação.</p>}{error && <p className="text-[10px] font-semibold text-red-300">{error}</p>}
      <ConsoleButton active className="w-full" disabled={saving || invalidRenegotiation} onClick={submit} icon={saving ? Loader2 : CheckCircle2}>{saving ? "Salvando..." : "Confirmar atendimento"}</ConsoleButton>
    </div></motion.div>}</AnimatePresence>
    {item.column === "human" && !editable && <p className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200"><ShieldAlert size={11} className="mr-1 inline" />Atualize a cobrança antes de devolver ao bot.</p>}
  </ConsoleCard>;
}
