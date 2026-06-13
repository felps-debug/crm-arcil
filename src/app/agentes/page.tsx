"use client";

import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useSupabase } from "@/hooks/use-supabase";
import { getAgentStats, getRecentConversations } from "@/lib/supabase/queries";
import { SEGMENT_LABELS } from "@/types";
import type { LeadSegment, Conversation } from "@/types";
import {
  Bot, Users, UserCheck, ArrowRightLeft,
  Wrench, Building2, Store, ShoppingBag, UserPlus, RotateCcw,
} from "lucide-react";

const AGENT_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: typeof Bot;
  gradient: string;
  iconBg: string;
  iconColor: string;
}> = {
  INSTALLER: {
    label: "Instalador",
    description: "Agente especializado em instaladores e técnicos",
    icon: Wrench,
    gradient: "from-blue-500 via-blue-600 to-indigo-600",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600",
  },
  BUILDER: {
    label: "Construtor",
    description: "Agente para construtoras e empreiteiras",
    icon: Building2,
    gradient: "from-emerald-500 via-emerald-600 to-teal-600",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600",
  },
  RESELLER: {
    label: "Revenda",
    description: "Agente para revendas e distribuidores",
    icon: Store,
    gradient: "from-violet-500 via-violet-600 to-purple-600",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600",
  },
  CONSUMER: {
    label: "Consumidor Final",
    description: "Agente para consumidores pessoa física",
    icon: ShoppingBag,
    gradient: "from-amber-400 via-amber-500 to-orange-500",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600",
  },
  NEW: {
    label: "Roteadora",
    description: "Agente que classifica e roteia novos leads",
    icon: RotateCcw,
    gradient: "from-sky-400 via-sky-500 to-cyan-500",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-600",
  },
};

function AgentCard({ segment, total, active, converted }: {
  segment: string;
  total: number;
  active: number;
  converted: number;
}) {
  const cfg = AGENT_CONFIG[segment] ?? AGENT_CONFIG.NEW;
  const Icon = cfg.icon;
  const rate = total > 0 ? ((converted / total) * 100).toFixed(0) : "0";

  return (
    <Card hover>
      <div className={`h-1.5 bg-gradient-to-r ${cfg.gradient}`} />
      <CardContent>
        <div className="flex items-start justify-between mb-5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ring-2 ring-opacity-20 ${cfg.iconBg}`}
               style={{ ["--tw-ring-color" as string]: "currentColor" }}>
            <Icon size={22} className={cfg.iconColor} strokeWidth={1.8} />
          </div>
          <Badge variant="info" dot>Ativo</Badge>
        </div>

        <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{cfg.label}</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">{cfg.description}</p>

        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-[var(--border)]">
          <div className="text-center">
            <p className="font-data text-[20px] font-bold text-[var(--text-primary)]">{total}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">Total</p>
          </div>
          <div className="text-center">
            <p className="font-data text-[20px] font-bold text-emerald-600">{active}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">Ativos</p>
          </div>
          <div className="text-center">
            <p className="font-data text-[20px] font-bold text-violet-600">{rate}%</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-0.5">Conversão</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentesPage() {
  const { data: stats, loading: loadingStats, error: errorStats, refetch: refetchStats } =
    useSupabase(() => getAgentStats(), []);

  const { data: conversations, loading: loadingConv, error: errorConv, refetch: refetchConv } =
    useSupabase(() => getRecentConversations(), []);

  const totalLeads = stats?.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const totalActive = stats?.reduce((sum, s) => sum + s.active, 0) ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Header title="Agentes IA" subtitle="Monitoramento dos agentes de atendimento" />

      <main className="px-6 py-8 space-y-8 max-w-[1440px] mx-auto">
        {/* Summary metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {loadingStats ? (
            Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : errorStats ? (
            <div className="col-span-full">
              <ErrorState message={errorStats} onRetry={refetchStats} />
            </div>
          ) : (
            <>
              <Card>
                <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Bot size={22} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Agentes Ativos</p>
                      <p className="font-data text-[32px] font-extrabold text-[var(--text-primary)] leading-none mt-1">5</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Users size={22} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Leads Atendidos</p>
                      <p className="font-data text-[32px] font-extrabold text-[var(--text-primary)] leading-none mt-1">{totalLeads}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <div className="h-1.5 bg-gradient-to-r from-violet-500 to-purple-500" />
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <UserCheck size={22} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Leads Ativos</p>
                      <p className="font-data text-[32px] font-extrabold text-[var(--text-primary)] leading-none mt-1">{totalActive}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </section>

        {/* Agent cards */}
        <section>
          <h2 className="text-[15px] font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Bot size={18} className="text-blue-500" />
            Agentes por Segmento
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {loadingStats ? (
              Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />)
            ) : errorStats ? (
              <div className="col-span-full">
                <ErrorState message={errorStats} onRetry={refetchStats} />
              </div>
            ) : (
              stats?.map((s) => (
                <AgentCard key={s.segment} {...s} />
              ))
            )}
          </div>
        </section>

        {/* Recent conversations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <ArrowRightLeft size={16} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Conversas Recentes</h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Últimas interações dos agentes</p>
                </div>
              </div>
              {conversations && conversations.length > 0 && (
                <Badge variant="default">{conversations.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingConv ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : errorConv ? (
              <div className="p-5">
                <ErrorState message={errorConv} onRetry={refetchConv} />
              </div>
            ) : !conversations?.length ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Bot size={28} className="text-slate-400" />
                </div>
                <p className="text-[14px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Nenhuma conversa registrada ainda
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                  As conversas dos agentes aparecerão aqui
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Canal", "Intenção", "Resumo", "Status", "Início"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(conversations as Conversation[]).map((conv) => (
                      <tr key={conv.id}>
                        <td>
                          <Badge variant="info">{conv.channel ?? "—"}</Badge>
                        </td>
                        <td className="font-medium text-[var(--text-primary)]">
                          {conv.intent ?? "—"}
                        </td>
                        <td className="text-[var(--text-secondary)] max-w-[300px] truncate">
                          {conv.summary ?? "—"}
                        </td>
                        <td>
                          <Badge variant={conv.status === "completed" ? "success" : conv.status === "active" ? "info" : "warning"}>
                            {conv.status ?? "—"}
                          </Badge>
                        </td>
                        <td className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {conv.started_at ? new Date(conv.started_at).toLocaleString("pt-BR") : "—"}
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
