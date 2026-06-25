"use client";

import { Header } from "@/components/layout/header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { MetricCardSkeleton, CardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LeadsAreaChart } from "@/components/charts/leads-chart";
import { useSupabase } from "@/hooks/use-supabase";
import { getDashboardStats, getLeadsTrend, getActiveLeads } from "@/lib/supabase/queries";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/types";
import type { LeadSegment, LeadStatus } from "@/types";
import { Users, UserCheck, Clock, MessageCircleReply, TrendingUp } from "lucide-react";
import { getInitials } from "@/lib/utils";

export default function DashboardPage() {
  const { data: stats, loading: loadingStats, error: errorStats, refetch: refetchStats } =
    useSupabase(() => getDashboardStats(), []);

  const { data: trend, loading: loadingTrend, error: errorTrend, refetch: refetchTrend } =
    useSupabase(() => getLeadsTrend(), []);

  const { data: recentLeads, loading: loadingRecent, error: errorRecent, refetch: refetchRecent } =
    useSupabase(() => getActiveLeads({ limit: 10 }), []);

  const last10 = recentLeads ?? [];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Dashboard" subtitle="Visão geral ARCIL CRM" />

      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-[1440px] mx-auto w-full">
        {/* Metric cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {loadingStats ? (
            Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : errorStats ? (
            <div className="col-span-full">
              <ErrorState message={errorStats} onRetry={refetchStats} />
            </div>
          ) : (
            <>
              <MetricCard
                label="Total Leads"
                value={String(stats?.totalLeads ?? 0)}
                icon={Users}
                accent="blue"
                change="excl. legado"
                trend="up"
              />
              <MetricCard
                label="Leads Ativos"
                value={String(stats?.leadsAtivos ?? 0)}
                icon={UserCheck}
                accent="emerald"
                change="status ACTIVE"
                trend="up"
              />
              <MetricCard
                label="Cobranças Pendentes"
                value={String(stats?.cobrancasPendentes ?? 0)}
                icon={Clock}
                accent="amber"
                change="aguardando"
                trend={stats?.cobrancasPendentes ? "down" : "up"}
              />
              <MetricCard
                label="Follow-ups Respondidos"
                value={String(stats?.followupsRespondidos ?? 0)}
                icon={MessageCircleReply}
                accent="violet"
                change={`de ${(stats?.followupsRespondidos ?? 0) + 30} total`}
                trend="up"
              />
              <MetricCard
                label="Taxa Resposta"
                value={`${stats?.taxaResposta ?? "0"}%`}
                icon={TrendingUp}
                accent="sky"
                change="follow-ups"
                trend={parseFloat(stats?.taxaResposta ?? "0") > 20 ? "up" : "down"}
              />
            </>
          )}
        </section>

        {/* Charts + Recent leads */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loadingTrend ? (
            <CardSkeleton />
          ) : errorTrend ? (
            <Card>
              <ErrorState message={errorTrend} onRetry={refetchTrend} />
            </Card>
          ) : (
            <Card accent>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Evolução de Leads</h2>
                    <p className="text-xs mt-1 text-[var(--text-muted)]">Últimos 6 meses (excl. legado)</p>
                  </div>
                  <Badge variant="info" dot>Atualizado</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <LeadsAreaChart data={trend ?? []} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <SectionTitle icon={Users} title="Leads Recentes" />
                {last10.length > 0 && (
                  <Badge variant="default">{last10.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRecent ? (
                <div className="p-5 space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}
                </div>
              ) : errorRecent ? (
                <div className="p-5">
                  <ErrorState message={errorRecent} onRetry={refetchRecent} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-enterprise">
                    <thead>
                      <tr>
                        {["Nome", "Segmento", "Status", "Data"].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {last10.map((lead) => (
                        <tr key={lead.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
                              >
                                <span className="text-white text-[10px] font-bold">
                                  {getInitials(lead.name ?? "?")}
                                </span>
                              </div>
                              <span className="font-semibold text-[var(--text-primary)]">
                                {lead.name ?? "Sem nome"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <Badge variant={lead.segment === "COBRANCA" ? "warning" : "info"}>
                              {SEGMENT_LABELS[lead.segment as LeadSegment] ?? lead.segment ?? "—"}
                            </Badge>
                          </td>
                          <td>
                            <Badge
                              variant={
                                lead.status === "ACTIVE"
                                  ? "success"
                                  : lead.status === "LOST"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {STATUS_LABELS[lead.status as LeadStatus] ?? lead.status ?? "—"}
                            </Badge>
                          </td>
                          <td className="text-xs tabular-nums text-[var(--text-muted)]">
                            {lead.created_at
                              ? new Date(lead.created_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
