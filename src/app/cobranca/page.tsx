"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment } from "react";
import {
  Clock,
  MessageCircleReply,
  Receipt,
  Send,
  ShieldAlert,
  DollarSign,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ConsoleButton, ConsoleCard, ConsoleError, ConsoleLoading, ConsoleMetric, ConsolePage, ConsoleStatus } from "@/components/console/console-shell";
import { AccessGuard } from "@/components/layout/access-guard";
import { CobrancaLogDrawer } from "@/components/ui/cobranca-log-drawer";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSupabase } from "@/hooks/use-supabase";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getCobrancaLog, getFollowupsByType } from "@/lib/supabase/queries";
import type { CobrancaLog } from "@/types";
import { DispararTab } from "./_components/disparar-tab";
import { MonitoramentoTab } from "./_components/monitoramento-tab";
import { FinancialHandoffBoard } from "./_components/financial-handoff-board";
import { FollowupsTab } from "./_components/followups-tab";
import { parseMoneyToNumber } from "./cobranca-helpers";

type Tab = "disparar" | "logs" | "financial" | "followups" | "tecnico";

export default function CobrancaPage() {
  return (
    <AccessGuard perm="manage_cobranca">
      <CobrancaPageInner />
    </AccessGuard>
  );
}

function CobrancaPageInner() {
  const [tab, setTab] = useState<Tab>("disparar");
  const { isSuperAdmin, isManagerOrAbove } = useCurrentUser();
  const [selectedLog, setSelectedLog] = useState<CobrancaLog | null>(null);
  const [expandedMeta, setExpandedMeta] = useState<string | null>(null);

  const { data: followups, loading: loadingFu, error: errorFu } = useSupabase(() => getFollowupsByType("cobranca"), []);

  const [logs, setLogs] = useState<CobrancaLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [errorLogs, setErrorLogs] = useState<string | null>(null);
  // Só a carga inicial (tela vazia) mostra o spinner de página inteira. Um
  // refetch disparado por realtime com `logs` já preenchido é revalidação em
  // segundo plano — a tabela antiga fica visível até a nova chegar.
  const fetchLogs = useCallback(async () => {
    setLogs((prev) => {
      if (prev.length === 0) setLoadingLogs(true);
      return prev;
    });
    setErrorLogs(null);
    try {
      setLogs(await getCobrancaLog());
    } catch (e) {
      setErrorLogs(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const supabase = createClient();
    // O realtime emite um evento por LINHA alterada — um disparo em lote grava
    // dezenas de linhas de uma vez em cobranca_log. Sem agrupar, cada uma
    // refazia a query inteira quase simultaneamente. Mesmo padrão de
    // src/app/page.tsx (refreshBatched).
    let batch: ReturnType<typeof setTimeout> | undefined;
    const fetchLogsBatched = () => {
      clearTimeout(batch);
      batch = setTimeout(fetchLogs, 500);
    };
    const ch = supabase
      .channel("cobranca-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, fetchLogsBatched)
      .subscribe();
    return () => {
      clearTimeout(batch);
      supabase.removeChannel(ch);
    };
  }, [fetchLogs]);

  // Derivado de `logs`, não de uma segunda consulta. getCobrancaStats rodava
  // uma vez na montagem e nunca mais, enquanto a tabela se atualiza por
  // realtime — os cards mostravam "1 disparado" com 3 linhas na tela logo
  // abaixo. Vindo da mesma lista, os números não têm como divergir.
  const stats = useMemo(
    () => ({
      total: logs.length,
      pendentes: logs.filter((l) => l.status_disparo === "PENDENTE").length,
      disparados: logs.filter((l) => l.status_disparo === "DISPARADO").length,
      naoDisparados: logs.filter((l) => l.status_disparo === "NAO DISPARADO").length,
      responderam: logs.filter((l) => l.respondeu).length,
      pagos: logs.filter((l) => l.pagamento_confirmado).length,
    }),
    [logs]
  );

  // Só o que ainda se deve. Antes somava todo log, então um pagamento confirmado
  // continuava no total e o card nunca caía — o número que mais gente olha era o
  // único que não reagia a ninguém pagar.
  const totalEmAberto = useMemo(
    () =>
      logs
        .filter((l) => !l.pagamento_confirmado)
        .reduce((sum, l) => sum + (parseMoneyToNumber(l.valor ?? "") ?? 0), 0),
    [logs]
  );
  const selectedFollowup = selectedLog ? followups?.find((f) => f.numero_cliente === selectedLog.telefone) ?? null : null;

  const TABS: { id: Tab; label: string; count?: number; adminOnly?: boolean }[] = [
    { id: "disparar", label: "Disparar" },
    { id: "logs", label: "Monitoramento", count: logs.length },
    { id: "financial", label: "Atendimentos financeiros" },
    { id: "followups", label: "Follow-ups", count: followups?.length },
    { id: "tecnico", label: "Logs Técnicos", count: logs.length, adminOnly: true },
  ];

  return (
    <ConsolePage title="Cobranças" subtitle="Disparos e acompanhamento em tempo real">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loadingLogs ? (
          <div className="xl:col-span-3"><ConsoleLoading /></div>
        ) : errorLogs ? (
          <div className="xl:col-span-3"><ConsoleError message={errorLogs} /></div>
        ) : (
          <>
            <ConsoleMetric label="Total disparados" value={stats.total} helper={`${stats.disparados} enviados`} icon={Send} tone="blue" />
            <ConsoleMetric label="Pendentes" value={stats.pendentes} helper="aguardando" icon={Clock} tone="amber" />
            {/* Telefone fixo, vazio ou ilegível na planilha. Alguém precisa
                achar o celular certo — por isso o card fica ao lado dos outros
                e não escondido atrás de um filtro. */}
            <ConsoleMetric
              label="Cobrança manual"
              value={stats.naoDisparados}
              helper="sem telefone válido"
              icon={ShieldAlert}
              tone="red"
            />
            <ConsoleMetric
              label="Responderam"
              value={stats.responderam}
              helper={`${stats.total ? ((stats.responderam / stats.total) * 100).toFixed(0) : 0}% taxa`}
              icon={MessageCircleReply}
              tone="green"
            />
            <ConsoleMetric label="Pag. confirmado" value={stats.pagos} helper="confirmados" icon={Receipt} tone="violet" />
            <ConsoleMetric
              label="Total em aberto"
              value={!loadingLogs && totalEmAberto > 0 ? formatCurrency(totalEmAberto) : "—"}
              helper="boletos não pagos"
              icon={DollarSign}
              tone="green"
            />
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções de cobrança">
        {TABS.filter((t) => !t.adminOnly || isSuperAdmin).map((t) => (
          <ConsoleButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="font-data opacity-80">{t.count}</span>}
          </ConsoleButton>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "disparar" && (
          <motion.div key="disparar" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DispararTab onDispatched={() => setTab("logs")} />
          </motion.div>
        )}

        {tab === "logs" && (
          <motion.div key="logs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <MonitoramentoTab
              logs={logs}
              loading={loadingLogs}
              error={errorLogs}
              onRefetch={fetchLogs}
              isManagerOrAbove={isManagerOrAbove}
              onSelectLog={setSelectedLog}
            />
          </motion.div>
        )}

        {tab === "financial" && (
          <motion.div key="financial" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <FinancialHandoffBoard />
          </motion.div>
        )}

        {tab === "followups" && (
          <motion.div key="followups" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <FollowupsTab followups={followups} loading={loadingFu} error={errorFu} />
          </motion.div>
        )}

        {tab === "tecnico" && isSuperAdmin && (
          <motion.div key="tecnico" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ConsoleCard pad={false}>
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={14} className="text-amber-400" />
                    <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Logs Técnicos da Automação</h2>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Dados brutos do sistema — visível apenas para superadmin</p>
                </div>
                <button onClick={fetchLogs} title="Atualizar" className="rounded-[8px] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  <RefreshCw size={13} className={loadingLogs ? "animate-spin" : ""} />
                </button>
              </div>
              {loadingLogs ? (
                <div className="p-4"><ConsoleLoading /></div>
              ) : errorLogs ? (
                <div className="p-4"><ConsoleError message={errorLogs} /></div>
              ) : !logs.length ? (
                <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">Nenhum registro encontrado</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                        {["", "Nome", "Telefone", "Documento", "Valor", "Vencimento", "Status Automação", "Data Disparo", "Metadata ERP"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const isExpanded = expandedMeta === log.id;
                        const tone = log.status_disparo === "DISPARADO" ? "green" : log.status_disparo === "NAO DISPARADO" ? "red" : "amber";
                        return (
                          <Fragment key={log.id}>
                            <tr className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-subtle)]">
                              <td className="px-3 py-2.5">
                                <button
                                  onClick={() => setExpandedMeta(isExpanded ? null : log.id)}
                                  className="p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                                >
                                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{log.nome ?? "—"}</td>
                              <td className="px-3 py-2.5 font-data text-[11px]">{log.telefone}</td>
                              <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)]">{log.documento ?? "—"}</td>
                              <td className="px-3 py-2.5">{log.valor ?? "—"}</td>
                              <td className="px-3 py-2.5">{log.vencimento ?? "—"}</td>
                              <td className="px-3 py-2.5"><ConsoleStatus tone={tone}>{log.status_disparo ?? "—"}</ConsoleStatus></td>
                              <td className="px-3 py-2.5 font-data text-[11px] text-[var(--text-muted)]">
                                {log.data_disparo ? new Date(log.data_disparo).toLocaleString("pt-BR") : "—"}
                              </td>
                              <td className="px-3 py-2.5">
                                {log.metadata ? (
                                  <span className="cursor-pointer text-[11px] text-blue-400" onClick={() => setExpandedMeta(isExpanded ? null : log.id)}>
                                    {isExpanded ? "ocultar" : "ver dados ERP"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[var(--text-muted)]">—</span>
                                )}
                              </td>
                            </tr>
                            {isExpanded && log.metadata && (
                              <tr>
                                <td colSpan={9} className="bg-[var(--bg-subtle)] px-4 py-3">
                                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-secondary)]">
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
            </ConsoleCard>
          </motion.div>
        )}
      </AnimatePresence>

      <CobrancaLogDrawer log={selectedLog} followup={selectedFollowup} onClose={() => setSelectedLog(null)} />
    </ConsolePage>
  );
}
