"use client";

import { use } from "react";
import Link from "next/link";
import {
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsoleMetric,
  ConsolePage,
  ConsoleStatus,
} from "@/components/console/console-shell";
import { useSupabase } from "@/hooks/use-supabase";
import { getActiveLeads, getFollowups, getRecentConversations } from "@/lib/supabase/queries";
import { STATUS_LABELS } from "@/types";
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
}> = {
  installer: { label: "Instalador",      description: "Técnicos e instaladores de AC",    icon: Wrench,       color: "text-blue-400",    bg: "bg-blue-500/8" },
  builder:   { label: "Construtor",      description: "Construtoras e empreiteiras",      icon: Building2,    color: "text-emerald-400", bg: "bg-emerald-500/8" },
  reseller:  { label: "Revenda",         description: "Revendas e distribuidores",        icon: Store,        color: "text-violet-400",  bg: "bg-violet-500/8" },
  consumer:  { label: "Consumidor",      description: "Pessoa física — consumidor final", icon: ShoppingBag,  color: "text-amber-400",   bg: "bg-amber-500/8" },
  new:       { label: "Roteadora",       description: "Classifica e roteia novos leads",  icon: RotateCcw,    color: "text-sky-400",     bg: "bg-sky-500/8" },
};

function statusTone(status: string | null): "green" | "amber" | "red" | "blue" | "slate" {
  if (status === "ACTIVE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "LOST") return "red";
  return "slate";
}

export default function AgentDetailPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = use(params);
  const cfg = AGENT_CONFIG[segment] ?? AGENT_CONFIG.new;
  const Icon = cfg.icon;
  const segmentUpper = segment.toUpperCase() as LeadSegment;

  const { data: leads, loading: loadingLeads, error: errorLeads } =
    useSupabase(() => getActiveLeads({ segment: segmentUpper }), [segment]);

  const { data: followups, loading: loadingFu, error: errorFu } =
    useSupabase(() => getFollowups(), []);

  const { data: conversations, loading: loadingConv, error: errorConv } =
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
    <ConsolePage title={cfg.label} subtitle={cfg.description}>
      <div className="flex items-center gap-4">
        <Link
          href="/agentes"
          className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={13} />
          Agentes
        </Link>
        <span className="text-[var(--border-strong)]">/</span>
        <div className={`flex items-center gap-2.5 rounded-full px-3 py-1.5 ${cfg.bg}`}>
          <Icon size={14} className={cfg.color} strokeWidth={1.8} />
          <span className={`text-[12px] font-semibold ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ConsoleMetric label="Total de Leads" value={totalLeads} icon={Users} tone="blue" />
        <ConsoleMetric label="Ativos" value={activeLeads} icon={UserCheck} tone="green" />
        <ConsoleMetric label="Conversão" value={`${convRate}%`} icon={ArrowRightLeft} tone="violet" />
        <ConsoleMetric label="Follow-ups" value={segmentFollowups.length} icon={MessageCircleReply} tone="amber" />
      </section>

      <ConsoleCard pad={false}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-blue-300" />
            <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Leads deste Agente</h2>
          </div>
          <span className="font-data text-[11px] text-[var(--text-muted)]">{totalLeads} leads</span>
        </div>
        {loadingLeads ? (
          <div className="p-4"><ConsoleLoading /></div>
        ) : errorLeads ? (
          <div className="p-4"><ConsoleError message={errorLeads} /></div>
        ) : !segmentLeads.length ? (
          <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">Nenhum lead neste segmento</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                  {["Nome", "Telefone", "Status", "Cidade", "Criado em"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segmentLeads.slice(0, 20).map((lead: Lead) => (
                  <tr key={lead.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{lead.name ?? "—"}</td>
                    <td className="px-3 py-2.5 font-data text-[var(--text-secondary)]">{lead.wa_phone ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {lead.status ? <ConsoleStatus tone={statusTone(lead.status)}>{STATUS_LABELS[lead.status as LeadStatus]}</ConsoleStatus> : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{lead.city ?? lead.region ?? "—"}</td>
                    <td className="px-3 py-2.5 font-data text-[11px] text-[var(--text-muted)]">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      <ConsoleCard pad={false}>
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircleReply size={15} className="text-violet-300" />
            <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Follow-ups</h2>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{respondedFu} de {segmentFollowups.length} responderam</p>
        </div>
        {loadingFu ? (
          <div className="p-4"><ConsoleLoading /></div>
        ) : errorFu ? (
          <div className="p-4"><ConsoleError message={errorFu} /></div>
        ) : !segmentFollowups.length ? (
          <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">Nenhum follow-up registrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                  {["Cliente", "Telefone", "Step", "Respondeu", "Produto", "Status"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segmentFollowups.slice(0, 15).map((f: Followup) => (
                  <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{f.nome_cliente ?? "—"}</td>
                    <td className="px-3 py-2.5 font-data text-[var(--text-secondary)]">{f.numero_cliente ?? "—"}</td>
                    <td className="px-3 py-2.5"><ConsoleStatus tone={f.followup_step && f.followup_step >= 3 ? "red" : "blue"}>Step {f.followup_step ?? 0}</ConsoleStatus></td>
                    <td className="px-3 py-2.5">{f.respondeu ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-[var(--text-secondary)]">{f.produto_negociado ?? "—"}</td>
                    <td className="px-3 py-2.5"><ConsoleStatus tone={f.status === "PENDING" ? "amber" : "slate"}>{f.status ?? "—"}</ConsoleStatus></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      <ConsoleCard pad={false}>
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={15} className="text-[var(--text-muted)]" />
            <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Conversas Recentes</h2>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Últimas interações registradas</p>
        </div>
        {loadingConv ? (
          <div className="p-4"><ConsoleLoading /></div>
        ) : errorConv ? (
          <div className="p-4"><ConsoleError message={errorConv} /></div>
        ) : !segmentConversations.length ? (
          <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">Nenhuma conversa registrada</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                  {["Canal", "Intenção", "Resumo", "Status", "Início"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(segmentConversations as Conversation[]).slice(0, 10).map((conv) => (
                  <tr key={conv.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2.5"><ConsoleStatus tone="blue">{conv.channel ?? "—"}</ConsoleStatus></td>
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{conv.intent ?? "—"}</td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 text-[var(--text-secondary)]">{conv.summary ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <ConsoleStatus tone={conv.status === "completed" ? "green" : conv.status === "active" ? "blue" : "amber"}>
                        {conv.status ?? "—"}
                      </ConsoleStatus>
                    </td>
                    <td className="px-3 py-2.5 font-data text-[11px] text-[var(--text-muted)]">
                      {conv.started_at ? new Date(conv.started_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>
    </ConsolePage>
  );
}
