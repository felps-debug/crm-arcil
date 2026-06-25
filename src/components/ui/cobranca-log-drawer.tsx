"use client";

import { X, MessageCircle, Phone, Receipt, FileText, CheckCircle2, XCircle, Clock, MessageCircleReply, TrendingUp } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { motion, AnimatePresence } from "framer-motion";
import type { CobrancaLog, Followup } from "@/types";

type BoletoItem = {
  doc: string;
  vencimento: string;
  valor: string;
  juros: string;
  multa: string;
  observacao: string;
};

// Campos internos do CRM que não devem aparecer no dump raw de metadata
const INTERNAL_FIELDS = new Set(["numero", "nome", "valor", "vencimento", "documento", "codigo_cliente", "tag", "boleto_count", "boletos_json"]);

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("pt-BR");
}

export function CobrancaLogDrawer({ log, followup, onClose }: { log: CobrancaLog | null; followup?: Followup | null; onClose: () => void }) {
  // Parse boletos individuais do metadata (gerado pelo parseSheetLeads agrupado)
  let boletos: BoletoItem[] = [];
  try {
    const raw = log?.metadata?.["boletos_json"];
    if (raw) boletos = JSON.parse(raw) as BoletoItem[];
  } catch { /* ignora parse error */ }

  const metadataEntries = log?.metadata
    ? Object.entries(log.metadata).filter(([k, v]) => !INTERNAL_FIELDS.has(k) && String(v ?? "").trim() !== "")
    : [];

  return (
    <AnimatePresence>
      {log && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[3px] z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[var(--bg-surface)] z-50 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalhes da cobrança de ${log.nome ?? "lead"}`}
          >
            <div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-sky-400" />

            {/* Header */}
            <div className="px-7 py-6 border-b border-[var(--border)]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-extrabold text-[var(--text-primary)] text-xl tracking-tight leading-tight">
                    {log.nome ?? "Sem nome"}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5 tabular-nums">
                    {log.telefone}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Fechar detalhes"
                  className="p-2 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Badge variant={log.status_disparo === "DISPARADO" ? "success" : "warning"} dot>
                  {log.status_disparo}
                </Badge>
                {log.reminder_stage && log.reminder_stage !== "NONE" && (
                  <Badge variant="info">{log.reminder_stage}</Badge>
                )}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Actions */}
              <div className="px-7 py-5 border-b border-[var(--border)] flex gap-3">
                <a href={`https://wa.me/${log.telefone}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" className="w-full shadow-md">
                    <MessageCircle size={15} />WhatsApp
                  </Button>
                </a>
                <Button size="sm" variant="secondary" className="flex-1">
                  <Phone size={15} />Ligar
                </Button>
              </div>

              {/* Resumo do disparo (dados do Supabase) */}
              <div className="px-7 py-6 border-b border-[var(--border)]">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Receipt size={13} /> Resumo do Disparo
                </h3>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { label: "Valor",       value: log.valor ?? "—" },
                    { label: "Vencimento",  value: log.vencimento ?? "—" },
                    { label: "Documento",   value: log.documento ?? "—" },
                    { label: "Disparado em", value: formatDateTime(log.data_disparo) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-5 mt-5">
                  <div className="flex items-center gap-1.5 text-sm">
                    {log.respondeu ? <CheckCircle2 size={15} className="text-emerald-500" /> : <XCircle size={15} className="text-[var(--text-muted)]" />}
                    <span className="text-[var(--text-secondary)]">Respondeu</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    {log.pagamento_confirmado ? <CheckCircle2 size={15} className="text-emerald-500" /> : <XCircle size={15} className="text-[var(--text-muted)]" />}
                    <span className="text-[var(--text-secondary)]">Pagamento confirmado</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3 text-xs text-[var(--text-muted)]">
                  <Clock size={12} /> Registrado em {formatDateTime(log.created_at)}
                </div>
              </div>

              {/* Follow-up registrado (tabela followups, tipo cobranca) */}
              <div className="px-7 py-6 border-b border-[var(--border)]">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5 flex items-center gap-2">
                  <MessageCircleReply size={13} /> Follow-up (Supabase)
                </h3>
                {!followup ? (
                  <p className="text-sm text-[var(--text-muted)]">Nenhum follow-up registrado para este número.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-5 flex-wrap">
                      <Badge variant={followup.status === "PENDING" ? "warning" : "default"}>{followup.status ?? "—"}</Badge>
                      <Badge variant={followup.followup_step && followup.followup_step >= 3 ? "danger" : "info"}>
                        Step {followup.followup_step ?? 0}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Última msg. IA</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{formatDateTime(followup.ultima_msg_ia)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Última msg. lead</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{formatDateTime(followup.ultima_msg_lead)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-5 text-sm">
                      {followup.respondeu ? <CheckCircle2 size={15} className="text-emerald-500" /> : <XCircle size={15} className="text-[var(--text-muted)]" />}
                      <span className="text-[var(--text-secondary)]">Respondeu o follow-up</span>
                    </div>
                  </>
                )}
              </div>

              {/* Boletos individuais */}
              {boletos.length > 0 && (
                <div className="px-7 py-6 border-b border-[var(--border)]">
                  <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp size={13} /> Boletos ({boletos.length})
                  </h3>
                  <div className="space-y-3">
                    {boletos.map((b, i) => (
                      <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">#{i + 1} — {b.doc || "—"}</span>
                          <span className="text-[13px] font-extrabold text-emerald-600 tabular-nums">{b.valor}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-[var(--text-muted)]">Vencimento </span>
                            <span className="font-semibold text-[var(--text-primary)]">{b.vencimento || "—"}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Juros </span>
                            <span className="font-semibold text-amber-600">{b.juros}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Multa </span>
                            <span className="font-semibold text-red-500">{b.multa}</span>
                          </div>
                        </div>
                        {b.observacao && (
                          <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-relaxed border-t border-[var(--border)] pt-2">{b.observacao}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dados originais da planilha (ERP) — campos não-internos */}
              {metadataEntries.length > 0 && (
                <div className="px-7 py-6">
                  <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5 flex items-center gap-2">
                    <FileText size={13} /> Dados ERP
                  </h3>
                  <div className="space-y-4">
                    {metadataEntries.map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">{key}</p>
                        <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5 break-words">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-7 py-5 border-t border-[var(--border)] flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
