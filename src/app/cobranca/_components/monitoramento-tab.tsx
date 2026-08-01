"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { ConsoleButton, ConsoleCard, ConsoleError, ConsoleStatus } from "@/components/console/console-shell";
import { useToast } from "@/components/ui/toast";
import { bulkSetPagamentoConfirmado } from "@/lib/supabase/queries";
import type { CobrancaLog } from "@/types";
import { parseMoneyToNumber, type SortKey } from "../cobranca-helpers";

function SortTh({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
}: {
  col: SortKey;
  label: string;
  sortCol: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (col: SortKey) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="group cursor-pointer select-none whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]"
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`transition-opacity ${active ? "opacity-100" : "opacity-20 group-hover:opacity-60"}`}>
          {active && sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </div>
    </th>
  );
}

function statusTone(status: string | null): "green" | "red" | "amber" {
  if (status === "DISPARADO") return "green";
  if (status === "NAO DISPARADO") return "red";
  return "amber";
}

export function MonitoramentoTab({
  logs,
  loading,
  error,
  onRefetch,
  isManagerOrAbove,
  onSelectLog,
}: {
  logs: CobrancaLog[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
  isManagerOrAbove: boolean;
  onSelectLog: (log: CobrancaLog) => void;
}) {
  const [searchLogs, setSearchLogs] = useState("");
  const [statusFilterLog, setStatusFilterLog] = useState("Todos");
  const [sortCol, setSortCol] = useState<SortKey | null>("data_disparo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [reenvioLoading, setReenvioLoading] = useState(false);
  const [reenvioResult, setReenvioResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [relatorioModal, setRelatorioModal] = useState(false);
  const [relFiltros, setRelFiltros] = useState({ de: "", ate: "", tipo: "Todos", status: "Todos" });
  const { toast } = useToast();

  function handleSort(col: SortKey) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (searchLogs.trim()) {
      const q = searchLogs.toLowerCase();
      result = result.filter((l) => l.nome?.toLowerCase().includes(q) || l.telefone?.includes(q));
    }
    if (statusFilterLog !== "Todos") {
      result = result.filter((l) => l.status_disparo === statusFilterLog);
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        let va = String(a[sortCol as keyof CobrancaLog] ?? "");
        let vb = String(b[sortCol as keyof CobrancaLog] ?? "");
        if (sortCol === "data_disparo") {
          va = a.data_disparo ?? "";
          vb = b.data_disparo ?? "";
        }
        const cmp = va.localeCompare(vb, "pt-BR", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [logs, searchLogs, statusFilterLog, sortCol, sortDir]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === filteredLogs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredLogs.map((l) => l.id)));
  }
  async function handleBulkConfirm() {
    if (!selectedIds.size) return;
    if (!confirm(`Marcar ${selectedIds.size} registro(s) como pago?`)) return;
    setBulkLoading(true);
    try {
      await bulkSetPagamentoConfirmado([...selectedIds], true);
      setSelectedIds(new Set());
      onRefetch();
      toast("Pagamento(s) confirmado(s).", "success");
    } catch {
      toast("Erro ao confirmar pagamentos.", "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleReenvio() {
    setReenvioLoading(true);
    setReenvioResult(null);
    try {
      const res = await fetch("/api/cobranca/reenviar-nao-disparados", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setReenvioResult({ ok: true, msg: "Reenvio iniciado com sucesso" });
      onRefetch();
    } catch (err) {
      setReenvioResult({ ok: false, msg: err instanceof Error ? err.message : "Erro" });
    } finally {
      setReenvioLoading(false);
    }
  }

  function handleExportCSV() {
    const headers = ["Nome", "Telefone", "Valor", "Boletos", "Vencimento", "Status", "Respondeu", "Pagamento", "Disparo em"];
    const rows = filteredLogs.map((l) => [
      l.nome ?? "",
      l.telefone ?? "",
      l.valor ?? "",
      String(l.boleto_count ?? ""),
      l.vencimento ?? "",
      l.status_disparo ?? "",
      l.respondeu ? "Sim" : "Não",
      l.pagamento_confirmado ? "Sim" : "Não",
      l.data_disparo ? new Date(l.data_disparo).toLocaleString("pt-BR") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cobranca-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGerarPDF() {
    const filtrados = logs.filter((l) => {
      if (relFiltros.status !== "Todos" && l.status_disparo !== relFiltros.status) return false;
      if (relFiltros.tipo !== "Todos" && l.documento !== relFiltros.tipo) return false;
      if (relFiltros.de && l.data_disparo && new Date(l.data_disparo) < new Date(relFiltros.de)) return false;
      if (relFiltros.ate && l.data_disparo && new Date(l.data_disparo) > new Date(relFiltros.ate + "T23:59:59")) return false;
      return true;
    });
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Relatório de Cobranças", 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Nome", "Telefone", "Valor", "Vencimento", "Tipo", "Status", "Disparo"]],
      body: filtrados.map((l) => [
        l.nome ?? "—",
        l.telefone,
        l.valor ?? "—",
        l.vencimento ?? "—",
        l.documento ?? "—",
        l.status_disparo,
        l.data_disparo ? new Date(l.data_disparo).toLocaleString("pt-BR") : "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    doc.save("relatorio-cobrancas.pdf");
    setRelatorioModal(false);
  }

  const totalEmAberto = useMemo(() => {
    return logs.reduce((sum, l) => sum + (parseMoneyToNumber(l.valor ?? "") ?? 0), 0);
  }, [logs]);

  return (
    <>
      <ConsoleCard pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Monitoramento ao Vivo</h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Atualização automática em tempo real</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isManagerOrAbove && (
              <button
                onClick={handleReenvio}
                disabled={reenvioLoading}
                className="flex items-center gap-1.5 rounded-[8px] border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
              >
                {reenvioLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Reenviar Não Disparados
              </button>
            )}
            <button
              onClick={handleExportCSV}
              title="Exporta os registros visíveis no filtro atual"
              className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <Download size={12} /> Exportar CSV
            </button>
            <button
              onClick={() => setRelatorioModal(true)}
              className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <FileText size={12} /> Exportar Relatório
            </button>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Ao vivo
            </span>
            <button
              onClick={onRefetch}
              title="Atualizar"
              className="rounded-[8px] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Nome ou telefone..."
              aria-label="Buscar por nome ou telefone"
              value={searchLogs}
              onChange={(e) => setSearchLogs(e.target.value)}
              className="w-52 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500/60"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["Todos", "DISPARADO", "NAO DISPARADO", "PENDENTE"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilterLog(s)}
                className={`rounded-[8px] px-2.5 py-1 text-[11px] font-bold transition-all ${
                  statusFilterLog === s
                    ? "bg-blue-500 text-white"
                    : "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="ml-auto font-data text-[11px] text-[var(--text-muted)]">
            {filteredLogs.length}/{logs.length} · Total em aberto {totalEmAberto > 0 ? totalEmAberto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
          </span>
        </div>

        {reenvioResult && (
          <div
            className={`mx-4 mt-4 flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[12px] ${
              reenvioResult.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300"
            }`}
          >
            {reenvioResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {reenvioResult.msg}
            <button onClick={() => setReenvioResult(null)} className="ml-auto opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="animate-spin text-blue-400" size={20} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ConsoleError message={error} />
          </div>
        ) : !logs.length ? (
          <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">Nenhum disparo registrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className="cursor-pointer accent-blue-500"
                      checked={filteredLogs.length > 0 && selectedIds.size === filteredLogs.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <SortTh col="nome" label="Nome" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="telefone" label="Telefone" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="valor" label="Valor" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Bol.</th>
                  <SortTh col="vencimento" label="Vencimento" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="status_disparo" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Respondeu</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pagamento</th>
                  <SortTh col="data_disparo" label="Disparo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => onSelectLog(log)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectLog(log);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-subtle)] focus-visible:bg-[var(--bg-subtle)] ${
                      selectedIds.has(log.id) ? "bg-blue-500/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="cursor-pointer accent-blue-500"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelect(log.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{log.nome ?? "—"}</td>
                    <td className="px-3 py-2.5 font-data text-[var(--text-secondary)]">{log.telefone}</td>
                    <td className="px-3 py-2.5 font-data font-semibold text-[var(--text-primary)]">{log.valor ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {log.boleto_count != null ? (
                        <span
                          className={`inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                            log.boleto_count > 1
                              ? "border border-amber-500/25 bg-amber-500/10 text-amber-300"
                              : "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                          }`}
                        >
                          {log.boleto_count}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{log.vencimento ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <ConsoleStatus tone={statusTone(log.status_disparo)}>{log.status_disparo}</ConsoleStatus>
                    </td>
                    <td className="px-3 py-2.5">
                      {log.respondeu ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}
                    </td>
                    <td className="px-3 py-2.5">
                      {log.pagamento_confirmado ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}
                    </td>
                    <td className="px-3 py-2.5 font-data text-[11px] text-[var(--text-muted)]">
                      {log.data_disparo ? new Date(log.data_disparo).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-3 shadow-[var(--shadow-card)]"
          >
            <span className="text-[13px] font-bold text-[var(--text-primary)]">
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <button
              onClick={handleBulkConfirm}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 rounded-[10px] bg-emerald-600 px-4 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Marcar como pago
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-[8px] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {relatorioModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRelatorioModal(false)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Exportar Relatório PDF</h2>
              <button onClick={() => setRelatorioModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">De</label>
                  <input
                    type="date"
                    value={relFiltros.de}
                    onChange={(e) => setRelFiltros((f) => ({ ...f, de: e.target.value }))}
                    className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Até</label>
                  <input
                    type="date"
                    value={relFiltros.ate}
                    onChange={(e) => setRelFiltros((f) => ({ ...f, ate: e.target.value }))}
                    className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tipo</label>
                <select
                  value={relFiltros.tipo}
                  onChange={(e) => setRelFiltros((f) => ({ ...f, tipo: e.target.value }))}
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                >
                  {["Todos", "PHB Maringá", "PHB Londrina", "HLB Maringá", "HLB Londrina", "ARCIL (PIX)"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Status</label>
                <select
                  value={relFiltros.status}
                  onChange={(e) => setRelFiltros((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                >
                  {["Todos", "DISPARADO", "NAO DISPARADO", "PENDENTE"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <ConsoleButton active onClick={handleGerarPDF} icon={FileText} className="w-full">
              Gerar PDF
            </ConsoleButton>
          </div>
        </div>
      )}
    </>
  );
}
