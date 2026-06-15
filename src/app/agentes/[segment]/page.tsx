"use client";

import { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { TableRowSkeleton, MetricCardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { MetricCard } from "@/components/ui/metric-card";
import { useSupabase } from "@/hooks/use-supabase";
import { getActiveLeads, getFollowups, getRecentConversations } from "@/lib/supabase/queries";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/types";
import type { Lead, LeadSegment, LeadStatus, Followup, Conversation } from "@/types";
import {
  ArrowLeft, Users, UserCheck, ArrowRightLeft, MessageCircleReply,
  Wrench, Building2, Store, ShoppingBag, RotateCcw, Bot,
  CheckCircle2, XCircle,
} from "lucide-react";

const AGENT_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
  bg: string;
  accent: string;
}> = {
  installer: { label: "Instalador",      description: "Técnicos e instaladores de AC",    icon: Wrench,       color: "text-blue-600",    bg: "bg-blue-500/8",    accent: "#2563eb" },
  builder:   { label: "Construtor",      description: "Construtoras e empreiteiras",      icon: Building2,    color: "text-emerald-600", bg: "bg-emerald-500/8", accent: "#059669" },
  reseller:  { label: "Revenda",         description: "Revendas e distribuidores",        icon: Store,        color: "text-violet-600",  bg: "bg-violet-500/8",  accent: "#7c3aed" },
  consumer:  { label: "Consumidor",      description: "Pessoa física — consumidor final", icon: ShoppingBag,  color: "text-amber-600",   bg: "bg-amber-500/8",   accent: "#d97706" },
  new:       { label: "Roteadora",       description: "Classifica e roteia novos leads",  icon: RotateCcw,    color: "text-sky-600",     bg: "bg-sky-500/8",     accent: "#0284c7" },
};

const STATUS_BADGE: Record<LeadStatus, "success" | "danger" | "warning"> = {
  ACTIVE: "success", LOST: "danger", IN_PROGRESS: "warning",
};

export default function AgentDetailPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = use(params);
  const cfg = AGENT_CONFIG[segment] ?? AGENT_CONFIG.new;
  const Icon = cfg.icon;
  const segmentUpper = segment.toUpperCase() as LeadSegment;

  const { data: leads, loading: loadingLeads, error: errorLeads, refetch: refetchLeads } =
    useSupabase(() => getActiveLeads({ segment: segmentUpper }), [segment]);

  const { data: followups, loading: loadingFu, error: errorFu, refetch: refetchFu } =
    useSupabase(() => getFollowups(), []);

  const { data: conversations, loading: loadingConv, error: errorConv, refetch: refetchConv } =
    useSupabase(() => getRecentConversations(50), []);

  const segmentLeads = leads ?? [];
  const segmentFollowups = (followups ?? []).filter(
    (f: Followup) => segmentLeads.some((l: Lead) => l.id === f.lead_id)
  );
  const segmentConversations = conversations ?? [];

  const totalLeads   = segmentLeads.length;
  const activeLeads  = segmentLeads.filter((l: Lead) => l.status === "ACTIVE").length;
  const convertedLeads = segmentLeads.filter((l: Lead) => l.status === "IN_PROGRESS").length;
  const convRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(0) : "0";
  const respondedFu = segmentFollowups.filter((f: Followup) => f.respondeu).length;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header
        title={cfg.label}
        subtitle={cfg.description}
      />

      <main className="flex-1 overflow-y-auto px-6 py-6 max-w-[1200px] mx-auto w-full space-y-6">

        {/* Back + agent identity */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
          <Link
            href="/agentes"
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={13} />
            Agentes
          </Link>
          <span className="text-[var(--border-strong)]">/</span>
          <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full ${cfg.bg}`}>
            <Icon size={14} className={cfg.color} strokeWidth={1.8} />
            <span className={`text-[12px] font-semibold ${cfg.color}`}>{cfg.label}</span>
          </div>
        </motion.div>

        {/* Metrics */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingLeads ? (
            Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : (
            <>
              <MetricCard label="Total de Leads"  value={String(totalLeads)}     icon={Users}               accent="blue"    />
              <MetricCard label="Ativos"          value={String(activeLeads)}    icon={UserCheck}           accent="emerald" />
              <MetricCard label="Conversão"       value={`${convRate}%`}         icon={ArrowRightLeft}      accent="violet"  />
              <MetricCard label="Follow-ups"      value={String(segmentFollowups.length)} icon={MessageCircleReply} accent="amber"  />
            </>
          )}
        </section>

        {/* Leads table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <SectionTitle icon={Users} title="Leads deste Agente" subtitle={`${totalLeads} leads`} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingLeads ? (
              <div className="p-5">{Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
            ) : errorLeads ? (
              <div className="p-5"><ErrorState message={errorLeads} onRetry={refetchLeads} /></div>
            ) : !segmentLeads.length ? (
              <p className="text-sm text-center py-12 text-[var(--text-muted)]">Nenhum lead neste segmento</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>{["Nome", "Telefone", "Status", "Cidade", "Criado em"].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {segmentLeads.slice(0, 20).map((lead: Lead) => (
                      <tr key={lead.id}>
                        <td className="font-medium text-[var(--text-primary)]">{lead.name ?? "—"}</td>
                        <td className="tabular-nums">{lead.wa_phone ?? "—"}</td>
                        <td>{lead.status ? <Badge variant={STATUS_BADGE[lead.status as LeadStatus]}>{STATUS_LABELS[lead.status as LeadStatus]}</Badge> : "—"}</td>
                        <td>{lead.city ?? lead.region ?? "—"}</td>
                        <td className="text-xs tabular-nums text-[var(--text-muted)]">
                          {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <SectionTitle icon={MessageCircleReply} title="Follow-ups" subtitle={`${respondedFu} de ${segmentFollowups.length} responderam`} iconBg="bg-violet-500/10" iconColor="text-violet-600" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFu ? (
              <div className="p-5">{Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
            ) : errorFu ? (
              <div className="p-5"><ErrorState message={errorFu} onRetry={refetchFu} /></div>
            ) : !segmentFollowups.length ? (
              <p className="text-sm text-center py-10 text-[var(--text-muted)]">Nenhum follow-up registrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>{["Cliente", "Telefone", "Step", "Respondeu", "Produto", "Status"].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {segmentFollowups.slice(0, 15).map((f: Followup) => (
                      <tr key={f.id}>
                        <td className="font-medium text-[var(--text-primary)]">{f.nome_cliente ?? "—"}</td>
                        <td className="tabular-nums">{f.numero_cliente ?? "—"}</td>
                        <td><Badge variant={f.followup_step && f.followup_step >= 3 ? "danger" : "info"}>Step {f.followup_step ?? 0}</Badge></td>
                        <td>{f.respondeu ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}</td>
                        <td className="text-[var(--text-secondary)] max-w-[180px] truncate">{f.produto_negociado ?? "—"}</td>
                        <td><Badge variant={f.status === "PENDING" ? "warning" : "default"}>{f.status ?? "—"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversations */}
        <Card>
          <CardHeader>
            <SectionTitle icon={ArrowRightLeft} title="Conversas Recentes" subtitle="Últimas interações registradas" />
          </CardHeader>
          <CardContent className="p-0">
            {loadingConv ? (
              <div className="p-5">{Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
            ) : errorConv ? (
              <div className="p-5"><ErrorState message={errorConv} onRetry={refetchConv} /></div>
            ) : !segmentConversations.length ? (
              <p className="text-sm text-center py-10 text-[var(--text-muted)]">Nenhuma conversa registrada</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>{["Canal", "Intenção", "Resumo", "Status", "Início"].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(segmentConversations as Conversation[]).slice(0, 10).map((conv) => (
                      <tr key={conv.id}>
                        <td><Badge variant="info">{conv.channel ?? "—"}</Badge></td>
                        <td className="font-medium text-[var(--text-primary)]">{conv.intent ?? "—"}</td>
                        <td className="max-w-[260px] truncate text-[var(--text-secondary)]">{conv.summary ?? "—"}</td>
                        <td>
                          <Badge variant={conv.status === "completed" ? "success" : conv.status === "active" ? "info" : "warning"}>
                            {conv.status ?? "—"}
                          </Badge>
                        </td>
                        <td className="text-xs tabular-nums text-[var(--text-muted)]">
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
