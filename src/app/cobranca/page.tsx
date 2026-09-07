"use client";

import { useRef, useState } from "react";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock, CreditCard, FileSpreadsheet, FileWarning, Loader2, PauseCircle, PlayCircle, Receipt, Search, Send, Upload, X, XCircle } from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsoleMetric,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { parseCobrancaFile, type CobrancaLead } from "@/lib/cobranca-parser";
import type { DashboardSummaryResponse, PendingCenterResponse } from "@/types/api";

const invalidRows = [
  { receipt: "#998421", phone: "(11) 90000-0000", error: "Formato de DDD invalido", status: "Rejeitado" },
  { receipt: "#998422", phone: "(21) 98888-77", error: "Numero incompleto", status: "Rejeitado" },
  { receipt: "#998425", phone: "(00) 91234-5678", error: "Prefixo inexistente", status: "Rejeitado" },
  { receipt: "#998429", phone: "(41) 3232-1010", error: "Telefone fixo incompativel", status: "Rejeitado" },
];

export default function CobrancaPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [leads, setLeads] = useState<CobrancaLead[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const summary = useApi<DashboardSummaryResponse>("/api/dashboard/summary");
  const pending = useApi<PendingCenterResponse>("/api/dashboard/pending-center");
  const loading = summary.loading || pending.loading;
  const error = summary.error || pending.error;
  const collectionsToday = pending.data?.items.find((i) => i.id === "collections_due_today")?.count ?? 0;
  const potential = summary.data?.metrics.find((m) => m.id === "potential_revenue")?.value ?? 0;

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setLeads([]);
    setParseError(null);
    setDispatchError(null);
    try {
      setLeads(await parseCobrancaFile(file));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    }
  }

  async function handleDispatch() {
    if (!leads.length) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const response = await fetch("/api/cobranca/disparo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível disparar a cobrança.");
      setLeads([]);
      setFileName(null);
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : "Não foi possível disparar a cobrança.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <ConsolePage
      title="Cobranca"
      subtitle="Disparos e acompanhamento"
      actions={<ConsoleInput placeholder="Buscar registro..." className="w-64" />}
    >
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && (
        <>
          <div className="flex flex-wrap gap-2">
            <ConsoleButton active>Disparar</ConsoleButton>
            <ConsoleButton>Monitoramento</ConsoleButton>
            <ConsoleButton>Follow-ups</ConsoleButton>
            <ConsoleButton>Logs tecnicos</ConsoleButton>
          </div>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <ConsoleMetric label="Total disparados" value="-" helper="Aguardando campanha" icon={Send} tone="blue" />
            <ConsoleMetric label="Pendentes" value={collectionsToday} helper="Vencem hoje" icon={Clock} tone="amber" />
            <ConsoleMetric label="Responderam" value="-" helper="Resposta por campanha" icon={CheckCircle2} tone="green" />
            <ConsoleMetric label="Pag. confirmado" value="-" helper="Confirmacao financeira" icon={Receipt} tone="green" />
            <ConsoleMetric label="Total em aberto" value={formatMoney(potential)} helper="Receita potencial" icon={CreditCard} tone="blue" />
          </section>

          <ConsoleCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Disparar cobrança</h2>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Importe uma planilha para validar os telefones antes do envio.</p>
              </div>
              {leads.length > 0 && <ConsoleStatus tone="green">{leads.length} lead{leads.length === 1 ? "" : "s"} válido{leads.length === 1 ? "" : "s"}</ConsoleStatus>}
            </div>

            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-inset)] px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-500/5">
              {fileName ? <FileSpreadsheet size={24} className="mb-2 text-blue-300" /> : <Upload size={24} className="mb-2 text-[var(--text-muted)]" />}
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{fileName ?? "Selecionar CSV ou Excel"}</span>
              <span className="mt-1 text-[10px] text-[var(--text-muted)]">Coluna aceita: telefone, celular, fone ou WhatsApp</span>
            </button>

            {(parseError || dispatchError) && <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300"><X size={14} />{parseError || dispatchError}</div>}
            {leads.length > 0 && <div className="mt-3 flex items-center justify-between gap-3 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"><span className="text-[11px] text-[var(--text-secondary)]">Primeiro telefone: <strong className="font-data text-[var(--text-primary)]">{leads[0].telefone}</strong></span><ConsoleButton icon={dispatching ? Loader2 : Send} onClick={() => void handleDispatch()} disabled={dispatching}>{dispatching ? "Enviando..." : "Disparar"}</ConsoleButton></div>}
          </ConsoleCard>

          <ConsoleCard>
            <div className="mb-5 grid grid-cols-5 items-center gap-2">
              {["Importar", "Mapear", "Validar", "Revisar", "Confirmar"].map((step, index) => (
                <div key={step} className="flex items-center gap-2">
                  <div className={`grid h-8 w-8 place-items-center rounded-full ${index < 2 ? "bg-emerald-500 text-black" : index === 2 ? "bg-blue-500 text-white" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"}`}>
                    {index < 2 ? <CheckCircle2 size={14} /> : index === 2 ? <FileWarning size={14} /> : <PauseCircle size={14} />}
                  </div>
                  <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">{step}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <ValidationCard label="Registros validos" value="1.180" status="Simulacao" tone="green" />
              <ValidationCard label="Registros invalidos" value="42" status="Correcao necessaria" tone="red" />
              <ValidationCard label="Duplicados" value="18" status="Limpeza automatica" tone="amber" />
            </div>
          </ConsoleCard>

          <ConsoleCard pad={false}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Registros com erro</h2>
              <ConsoleButton>Todos os erros</ConsoleButton>
            </div>
            <ConsoleTable headers={["Registro", "Telefone", "Motivo do erro", "Status", "Acao"]}>
              {invalidRows.map((row) => (
                <tr key={row.receipt} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3 font-data text-[var(--text-primary)]">{row.receipt}</td>
                  <td className="px-3 py-3 font-data text-[var(--text-secondary)]">{row.phone}</td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{row.error}</td>
                  <td className="px-3 py-3"><ConsoleStatus tone="red">{row.status}</ConsoleStatus></td>
                  <td className="px-3 py-3"><ConsoleButton icon={Search}>Corrigir</ConsoleButton></td>
                </tr>
              ))}
            </ConsoleTable>
          </ConsoleCard>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ConsoleCard>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-blue-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Mapa de Qualidade de Dados</h2>
              </div>
              <div className="mt-4 grid h-48 place-items-center rounded-[8px] bg-[var(--bg-inset)]">
                <div className="text-center">
                  <p className="font-data text-[30px] font-bold text-blue-300">96.5%</p>
                  <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">Precisao media</p>
                </div>
              </div>
            </ConsoleCard>
            <ConsoleCard>
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock size={16} className="text-violet-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Agendamento de Disparo</h2>
              </div>
              <div className="space-y-2">
                <ScheduleOption icon={PlayCircle} label="Disparo imediato" active />
                <ScheduleOption icon={Clock} label="Agendar para mais tarde" />
                <ScheduleOption icon={XCircle} label="Pausar campanha" />
              </div>
            </ConsoleCard>
          </section>
        </>
      )}
    </ConsolePage>
  );
}

function ValidationCard({ label, value, status, tone }: { label: string; value: string; status: string; tone: "green" | "red" | "amber" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
      <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-data text-[24px] font-bold text-[var(--text-primary)]">{formatNumber(value)}</p>
        <ConsoleStatus tone={tone}>{status}</ConsoleStatus>
      </div>
    </div>
  );
}

function ScheduleOption({ icon: Icon, label, active }: { icon: typeof PlayCircle; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-[8px] border p-3 ${active ? "border-blue-500/40 bg-blue-500/10" : "border-[var(--border)] bg-[var(--bg-inset)]"}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-[var(--text-muted)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</span>
      </div>
      <span className={`h-3 w-3 rounded-full border ${active ? "border-blue-400 bg-blue-400" : "border-[var(--border-strong)]"}`} />
    </div>
  );
}
