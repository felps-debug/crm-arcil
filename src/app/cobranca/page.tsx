"use client";

import { Header } from "@/components/layout/header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useSupabase } from "@/hooks/use-supabase";
import { getCobrancaLog, getCobrancaStats, getFollowupsByType } from "@/lib/supabase/queries";
import {
  Receipt,
  Clock,
  MessageCircleReply,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";

export default function CobrancaPage() {
  const { data: stats, loading: loadingStats, error: errorStats, refetch: refetchStats } =
    useSupabase(() => getCobrancaStats(), []);

  const { data: logs, loading: loadingLogs, error: errorLogs, refetch: refetchLogs } =
    useSupabase(() => getCobrancaLog(), []);

  const { data: followups, loading: loadingFollowups, error: errorFollowups, refetch: refetchFollowups } =
    useSupabase(() => getFollowupsByType("cobranca"), []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Header title="Cobrança" subtitle="Gestão de cobranças e disparos" />

      <main className="px-6 py-8 space-y-8 max-w-[1440px] mx-auto">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {loadingStats ? (
            Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : errorStats ? (
            <div className="col-span-full">
              <ErrorState message={errorStats} onRetry={refetchStats} />
            </div>
          ) : (
            <>
              <MetricCard label="Total Disparados" value={String(stats?.total ?? 0)} icon={Send} accent="blue" change={`${stats?.disparados ?? 0} enviados`} trend="up" />
              <MetricCard label="Pendentes" value={String(stats?.pendentes ?? 0)} icon={Clock} accent="amber" change="aguardando horário" trend={stats?.pendentes ? "down" : "up"} />
              <MetricCard label="Responderam" value={String(stats?.responderam ?? 0)} icon={MessageCircleReply} accent="emerald" change={`${stats?.total ? ((stats.responderam / stats.total) * 100).toFixed(0) : 0}% taxa`} trend="up" />
              <MetricCard label="Pagamento Confirmado" value={String(stats?.pagos ?? 0)} icon={Receipt} accent="violet" change="confirmados" trend="up" />
            </>
          )}
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Send size={16} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Disparos de Cobrança</h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Registro de cobranças enviadas</p>
                </div>
              </div>
              {logs && logs.length > 0 && (
                <Badge variant="default">{logs.length} registros</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingLogs ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : errorLogs ? (
              <div className="p-5">
                <ErrorState message={errorLogs} onRetry={refetchLogs} />
              </div>
            ) : !logs?.length ? (
              <p className="text-[14px] text-center py-12" style={{ color: "var(--text-muted)" }}>
                Nenhum disparo de cobrança registrado
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Nome", "Telefone", "Documento", "Status", "Respondeu", "Pagamento", "Data Disparo"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-medium text-[var(--text-primary)]">
                          {log.nome ?? "—"}
                        </td>
                        <td className="text-[var(--text-secondary)] tabular-nums">
                          {log.telefone}
                        </td>
                        <td className="text-[var(--text-secondary)]">
                          {log.documento ?? "—"}
                        </td>
                        <td>
                          <Badge variant={log.status_disparo === "DISPARADO" ? "success" : "warning"}>
                            {log.status_disparo}
                          </Badge>
                        </td>
                        <td>
                          {log.respondeu ? (
                            <CheckCircle2 size={18} className="text-emerald-500" />
                          ) : (
                            <XCircle size={18} className="text-slate-300" />
                          )}
                        </td>
                        <td>
                          {log.pagamento_confirmado ? (
                            <CheckCircle2 size={18} className="text-emerald-500" />
                          ) : (
                            <XCircle size={18} className="text-slate-300" />
                          )}
                        </td>
                        <td className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {log.data_disparo ? new Date(log.data_disparo).toLocaleString("pt-BR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <MessageCircleReply size={16} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Follow-ups de Cobrança</h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Acompanhamento de respostas</p>
                </div>
              </div>
              {followups && followups.length > 0 && (
                <Badge variant="info">{followups.length} follow-ups</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFollowups ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : errorFollowups ? (
              <div className="p-5">
                <ErrorState message={errorFollowups} onRetry={refetchFollowups} />
              </div>
            ) : !followups?.length ? (
              <p className="text-[14px] text-center py-12" style={{ color: "var(--text-muted)" }}>
                Nenhum follow-up de cobrança
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Cliente", "Telefone", "Step", "Respondeu", "Última Msg IA", "Status"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {followups.map((f) => (
                      <tr key={f.id}>
                        <td className="font-medium text-[var(--text-primary)]">
                          {f.nome_cliente ?? "—"}
                        </td>
                        <td className="text-[var(--text-secondary)] tabular-nums">
                          {f.numero_cliente ?? "—"}
                        </td>
                        <td>
                          <Badge variant={f.followup_step && f.followup_step >= 3 ? "danger" : "info"}>
                            Step {f.followup_step ?? 0}
                          </Badge>
                        </td>
                        <td>
                          {f.respondeu ? (
                            <CheckCircle2 size={18} className="text-emerald-500" />
                          ) : (
                            <XCircle size={18} className="text-slate-300" />
                          )}
                        </td>
                        <td className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {f.ultima_msg_ia ? new Date(f.ultima_msg_ia).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td>
                          <Badge variant={f.status === "PENDING" ? "warning" : "default"}>
                            {f.status ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
