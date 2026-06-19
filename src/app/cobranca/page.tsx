"use client";

import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { CobrancaLogDrawer } from "@/components/ui/cobranca-log-drawer";
import { useSupabase } from "@/hooks/use-supabase";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getCobrancaLog, getCobrancaStats, getFollowupsByType } from "@/lib/supabase/queries";
import type { CobrancaLog } from "@/types";
import {
  Receipt, Clock, MessageCircleReply, CheckCircle2, XCircle,
  Send, Upload, X, Loader2, FileSpreadsheet, Zap, RefreshCw, ShieldAlert, ChevronDown, ChevronRight,
} from "lucide-react";

type DisparoLead = Record<string, string>;

function normalizeKey(k: string) { return k.toLowerCase().replace(/[^a-z]/g, ""); }

// ERP exporta o cliente como "535 - 16.711.842 ADILSON ROBERTO SOARES" (código - doc nome)
// ou "1282 - CLEBER LEONARDO DOS SANTOS 05141624900" (doc colado no final do nome).
// Extrai só o nome, descartando código e CPF/CNPJ.
function parseClienteField(raw: string): { codigo: string; nome: string } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d+)\s*-\s*(.+)$/);
  const codigo = m ? m[1] : "";
  let nome = (m ? m[2] : trimmed).trim();
  nome = nome.replace(/^[\d./-]+\s+/, "");  // remove CPF/CNPJ com pontos antes do nome
  nome = nome.replace(/\s+\d{6,}$/, "");     // remove CPF/CNPJ colado no final do nome
  return { codigo, nome: nome.trim() };
}

// Converte texto monetário ("530,00" pt-BR, "1.234,56" pt-BR ou "17.16" en-US) para número.
function parseMoneyToNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : null;
}

function parseSheetLeads(rows: Record<string, unknown>[]): DisparoLead[] {
  return rows.map((row) => {
    // Preserve every original ERP column
    const original: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) original[k] = String(v ?? "").trim();

    // Normalized map for lookup
    const n: Record<string, string> = {};
    for (const [k, v] of Object.entries(original)) n[normalizeKey(k)] = v;

    // Build numero = "55" + digits from phone column
    const rawPhone = n["telefone"] ?? n["celular"] ?? n["fone"] ?? n["whatsapp"] ?? n["numero"] ?? "";
    const digits = rawPhone.replace(/\D/g, "");
    const numero = digits ? `55${digits}` : "";

    // Nome: coluna direta (nome/cliente) ou combinada do ERP "Cód / Cliente" (ex: "535 - 16.711.842 FULANO")
    let nome = n["nome"] ?? "";
    let codigoCliente = "";
    if (!nome) {
      const clienteKey = Object.keys(n).find((k) => k.includes("cliente"));
      if (clienteKey) {
        const parsed = parseClienteField(n[clienteKey]);
        nome = parsed.nome;
        codigoCliente = parsed.codigo;
      }
    }

    // Valor: coluna direta "valor" ou "R$ Princ" do relatório ERP
    let valorRaw = n["valor"] ?? "";
    if (!valorRaw) {
      const princKey = Object.keys(n).find((k) => k.includes("princ"));
      if (princKey) valorRaw = n[princKey];
    }
    const valorNum = parseMoneyToNumber(valorRaw);
    const valor = valorNum !== null ? formatCurrency(valorNum) : valorRaw;

    return {
      ...original,
      numero,
      nome,
      valor,
      codigo_cliente: codigoCliente,
      vencimento: n["vencimento"] ?? n["prorrog"]    ?? n["datavcto"] ?? n["vcto"] ?? "",
      documento:  n["serdocpar"]  ?? n["documento"]  ?? n["doc"]     ?? n["cpf"]  ?? n["cnpj"] ?? "",
      tag:        "COBRANCA",
    };
  }).filter((l) => l.numero.length >= 12);
}

type Tab = "disparar" | "logs" | "followups" | "tecnico";

export default function CobrancaPage() {
  const [tab, setTab] = useState<Tab>("disparar");
  const { isSuperAdmin } = useCurrentUser();

  const { data: stats, loading: loadingStats, error: errorStats, refetch: refetchStats } =
    useSupabase(() => getCobrancaStats(), []);

  const { data: followups, loading: loadingFu, error: errorFu, refetch: refetchFu } =
    useSupabase(() => getFollowupsByType("cobranca"), []);

  const [logs, setLogs] = useState<CobrancaLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [errorLogs, setErrorLogs] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<CobrancaLog | null>(null);
  const selectedFollowup = selectedLog
    ? followups?.find((f) => f.numero_cliente === selectedLog.telefone) ?? null
    : null;

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true); setErrorLogs(null);
    try { setLogs(await getCobrancaLog()); }
    catch (e) { setErrorLogs(e instanceof Error ? e.message : "Erro"); }
    finally { setLoadingLogs(false); }
  }, []);

  useEffect(() => {
    fetchLogs();
    const supabase = createClient();
    const ch = supabase
      .channel("cobranca-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, fetchLogs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchLogs]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DisparoLead[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; inserted?: number; error?: string } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setParseError(null); setPreview([]); setDispatchResult(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = xlsxRead(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        // raw: false → usa o texto formatado da célula (evita corromper "530,00" em 53000
        // e datas em números de série ao ler CSV/XLSX do relatório do ERP)
        const rows = xlsxUtils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
        const leads = parseSheetLeads(rows);
        if (!leads.length) throw new Error("Nenhum lead válido. Verifique se há coluna de telefone.");
        setPreview(leads);
      } catch (err) { setParseError(err instanceof Error ? err.message : "Erro ao processar arquivo."); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleDispatch() {
    if (!preview.length) return;
    setDispatching(true); setDispatchResult(null);
    try {
      const res = await fetch("/api/cobranca/disparo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: preview }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao disparar");
      setDispatchResult({ ok: true, inserted: data.inserted });
      setPreview([]); setFileName(null);
      setTab("logs");
    } catch (err) {
      setDispatchResult({ ok: false, error: err instanceof Error ? err.message : "Erro" });
    } finally { setDispatching(false); }
  }

  const [expandedMeta, setExpandedMeta] = useState<string | null>(null);

  const TABS: { id: Tab; label: string; count?: number; adminOnly?: boolean }[] = [
    { id: "disparar",  label: "Disparar" },
    { id: "logs",      label: "Monitoramento", count: logs.length },
    { id: "followups", label: "Follow-ups",    count: followups?.length },
    { id: "tecnico",   label: "Logs Técnicos", count: logs.length, adminOnly: true },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Cobrança" subtitle="Disparos e acompanhamento em tempo real" />

      <main className="flex-1 overflow-y-auto px-6 py-6 max-w-[1440px] mx-auto w-full space-y-6">

        {/* Metrics row — always visible */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingStats ? (
            Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : errorStats ? (
            <div className="col-span-4"><ErrorState message={errorStats} onRetry={refetchStats} /></div>
          ) : (
            <>
              <MetricCard label="Total Disparados"    value={String(stats?.total ?? 0)}        icon={Send}               accent="blue"    change={`${stats?.disparados ?? 0} enviados`} trend="up" />
              <MetricCard label="Pendentes"           value={String(stats?.pendentes ?? 0)}    icon={Clock}              accent="amber"   change="aguardando" trend={stats?.pendentes ? "down" : "up"} />
              <MetricCard label="Responderam"         value={String(stats?.responderam ?? 0)}  icon={MessageCircleReply} accent="emerald" change={`${stats?.total ? ((stats.responderam / stats.total) * 100).toFixed(0) : 0}% taxa`} trend="up" />
              <MetricCard label="Pag. Confirmado"     value={String(stats?.pagos ?? 0)}        icon={Receipt}            accent="violet"  change="confirmados" trend="up" />
            </>
          )}
        </section>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] w-fit shadow-[var(--shadow-xs)]">
          {TABS.filter((t) => !t.adminOnly || isSuperAdmin).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                tab === t.id ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {tab === t.id && (
                <motion.div
                  layoutId="cobranca-tab"
                  className="absolute inset-0 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              {t.adminOnly && <ShieldAlert size={11} className="relative z-10 text-amber-500" />}
              <span className="relative z-10">{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span className="relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {tab === "disparar" && (
            <motion.div key="disparar" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Card>
                <CardHeader>
                  <SectionTitle icon={Zap} title="Disparar Cobrança" subtitle="Importe uma planilha e dispare mensagens de cobrança" iconBg="bg-amber-500/10" iconColor="text-amber-600" />
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Upload zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all hover:border-[var(--blue)] hover:bg-blue-500/3 group"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
                    <FileSpreadsheet size={28} className="mx-auto mb-3 text-[var(--text-muted)] group-hover:text-[var(--blue)] transition-colors" />
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">
                      {fileName ?? "Clique para importar planilha"}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1">CSV, XLSX, XLS · Colunas: telefone, nome, valor, vencimento, documento</p>
                  </div>

                  {parseError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-[13px] text-red-500">
                      <X size={14} /> {parseError}
                    </div>
                  )}

                  {dispatchResult && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] border ${dispatchResult.ok ? "bg-emerald-500/8 border-emerald-500/15 text-emerald-600" : "bg-red-500/8 border-red-500/15 text-red-500"}`}>
                      {dispatchResult.ok ? <CheckCircle2 size={14} /> : <X size={14} />}
                      {dispatchResult.ok ? `${dispatchResult.inserted} leads inseridos — acompanhe no Monitoramento` : dispatchResult.error}
                    </div>
                  )}

                  {preview.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                          {preview.length} leads encontrados
                        </p>
                        <button onClick={() => { setPreview([]); setFileName(null); }} className="text-[12px] text-[var(--text-muted)] hover:text-red-500 flex items-center gap-1 transition-colors">
                          <X size={12} /> Limpar
                        </button>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                        <div className="overflow-x-auto max-h-56 overflow-y-auto">
                          <table className="w-full text-sm table-enterprise">
                            <thead className="sticky top-0" style={{ background: "var(--bg-subtle)" }}>
                              <tr>{["Número","Nome","Valor","Vencimento","Documento"].map((h) => <th key={h}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {preview.map((l, i) => (
                                <tr key={i}>
                                  <td className="tabular-nums font-medium text-[var(--text-primary)]">{l.numero}</td>
                                  <td>{l.nome || "—"}</td>
                                  <td>{l.valor || "—"}</td>
                                  <td>{l.vencimento || "—"}</td>
                                  <td>{l.documento || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <button
                        onClick={handleDispatch}
                        disabled={dispatching}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white shadow-sm transition-all disabled:opacity-60 bg-[var(--blue)] hover:opacity-90"
                      >
                        {dispatching ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {dispatching ? "Disparando..." : `Disparar ${preview.length} cobranças`}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {tab === "logs" && (
            <motion.div key="logs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <SectionTitle icon={Send} title="Monitoramento ao Vivo" subtitle="Atualização automática em tempo real" />
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Ao vivo
                      </span>
                      <button onClick={fetchLogs} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Atualizar">
                        <RefreshCw size={13} className={loadingLogs ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingLogs ? (
                    <div className="p-5">{Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
                  ) : errorLogs ? (
                    <div className="p-5"><ErrorState message={errorLogs} onRetry={fetchLogs} /></div>
                  ) : !logs.length ? (
                    <p className="text-sm text-center py-12 text-[var(--text-muted)]">Nenhum disparo registrado</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm table-enterprise">
                        <thead><tr>{["Nome","Telefone","Valor","Vencimento","Status","Respondeu","Pagamento","Disparo"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                          {logs.map((log) => (
                            <tr
                              key={log.id}
                              onClick={() => setSelectedLog(log)}
                              className="cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
                              title="Ver todos os detalhes deste disparo"
                            >
                              <td className="font-medium text-[var(--text-primary)]">{log.nome ?? "—"}</td>
                              <td className="tabular-nums">{log.telefone}</td>
                              <td>{log.valor ?? "—"}</td>
                              <td>{log.vencimento ?? "—"}</td>
                              <td><Badge variant={log.status_disparo === "DISPARADO" ? "success" : "warning"}>{log.status_disparo}</Badge></td>
                              <td>{log.respondeu ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}</td>
                              <td>{log.pagamento_confirmado ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}</td>
                              <td className="text-xs tabular-nums text-[var(--text-muted)]">{log.data_disparo ? new Date(log.data_disparo).toLocaleString("pt-BR") : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {tab === "followups" && (
            <motion.div key="followups" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Card>
                <CardHeader>
                  <SectionTitle icon={MessageCircleReply} title="Follow-ups de Cobrança" subtitle="Acompanhamento de respostas" iconBg="bg-violet-500/10" iconColor="text-violet-600" />
                </CardHeader>
                <CardContent className="p-0">
                  {loadingFu ? (
                    <div className="p-5">{Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
                  ) : errorFu ? (
                    <div className="p-5"><ErrorState message={errorFu} onRetry={refetchFu} /></div>
                  ) : !followups?.length ? (
                    <p className="text-sm text-center py-12 text-[var(--text-muted)]">Nenhum follow-up</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm table-enterprise">
                        <thead><tr>{["Cliente","Telefone","Step","Respondeu","Última Msg","Status"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                          {followups.map((f) => (
                            <tr key={f.id}>
                              <td className="font-medium text-[var(--text-primary)]">{f.nome_cliente ?? "—"}</td>
                              <td className="tabular-nums">{f.numero_cliente ?? "—"}</td>
                              <td><Badge variant={f.followup_step && f.followup_step >= 3 ? "danger" : "info"}>Step {f.followup_step ?? 0}</Badge></td>
                              <td>{f.respondeu ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}</td>
                              <td className="text-xs tabular-nums text-[var(--text-muted)]">{f.ultima_msg_ia ? new Date(f.ultima_msg_ia).toLocaleString("pt-BR") : "—"}</td>
                              <td><Badge variant={f.status === "PENDING" ? "warning" : "default"}>{f.status ?? "—"}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
          {tab === "tecnico" && isSuperAdmin && (
            <motion.div key="tecnico" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <SectionTitle icon={ShieldAlert} title="Logs Técnicos da Automação" subtitle="Dados brutos do sistema Python — visível apenas para superadmin" iconBg="bg-amber-500/10" iconColor="text-amber-600" />
                    <button onClick={fetchLogs} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Atualizar">
                      <RefreshCw size={13} className={loadingLogs ? "animate-spin" : ""} />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingLogs ? (
                    <div className="p-5">{Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
                  ) : errorLogs ? (
                    <div className="p-5"><ErrorState message={errorLogs} onRetry={fetchLogs} /></div>
                  ) : !logs.length ? (
                    <p className="text-sm text-center py-12 text-[var(--text-muted)]">Nenhum registro encontrado</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm table-enterprise">
                        <thead>
                          <tr>{["","Nome","Telefone","Documento","Valor","Vencimento","Status Automação","Data Disparo","Metadata ERP"].map((h) => <th key={h}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {logs.map((log) => {
                            const isExpanded = expandedMeta === log.id;
                            const statusColor = log.status_disparo === "DISPARADO"
                              ? "success"
                              : log.status_disparo === "NAO_DISPARADO"
                              ? "danger"
                              : "warning";
                            return (
                              <Fragment key={log.id}>
                                <tr className="hover:bg-[var(--bg-subtle)] transition-colors">
                                  <td>
                                    <button
                                      onClick={() => setExpandedMeta(isExpanded ? null : log.id)}
                                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    </button>
                                  </td>
                                  <td className="font-medium text-[var(--text-primary)]">{log.nome ?? "—"}</td>
                                  <td className="tabular-nums text-xs">{log.telefone}</td>
                                  <td className="text-xs text-[var(--text-muted)]">{log.documento ?? "—"}</td>
                                  <td>{log.valor ?? "—"}</td>
                                  <td>{log.vencimento ?? "—"}</td>
                                  <td><Badge variant={statusColor}>{log.status_disparo ?? "—"}</Badge></td>
                                  <td className="text-xs tabular-nums text-[var(--text-muted)]">{log.data_disparo ? new Date(log.data_disparo).toLocaleString("pt-BR") : "—"}</td>
                                  <td>
                                    {log.metadata ? (
                                      <span className="text-xs text-[var(--blue)] cursor-pointer" onClick={() => setExpandedMeta(isExpanded ? null : log.id)}>
                                        {isExpanded ? "ocultar" : "ver dados ERP"}
                                      </span>
                                    ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                                  </td>
                                </tr>
                                {isExpanded && log.metadata && (
                                  <tr>
                                    <td colSpan={9} className="bg-[var(--bg-subtle)] px-4 py-3">
                                      <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-all font-mono max-h-48 overflow-y-auto">
                                        {JSON.stringify(log.metadata, null, 2)}
                                      </pre>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <CobrancaLogDrawer log={selectedLog} followup={selectedFollowup} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
