"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Clock, Inbox, MessageSquare, Pause, PlugZap, Wrench } from "lucide-react";
import {
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsoleMetric,
  ConsoleButton,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { AgentConversationsDrawer } from "@/components/ui/agent-conversations-drawer";
import { formatDateTime, formatNumber, useApi } from "@/lib/client-api";
import type { AgentSummaryResponse } from "@/types/api";

export default function AgentesPage() {
  const { data, loading, error } = useApi<AgentSummaryResponse>("/api/agents/summary");
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string } | null>(null);

  const filteredAgents = useMemo(() => {
    const agents = data?.agents ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <ConsolePage
      title="Agentes IA"
      subtitle="Monitoramento e controle dos agentes"
      actions={
        <ConsoleInput
          placeholder="Buscar agentes..."
          className="w-60"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      }
    >
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && data && (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.metrics?.slice(0, 3).map((m, index) => (
              <ConsoleMetric
                key={m.id}
                label={m.label || ""}
                value={formatNumber(m.value ?? 0)}
                icon={[Bot, CheckCircle2, PlugZap][index]}
                tone={index === 1 ? "green" : index === 2 ? "violet" : "blue"}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {filteredAgents.map((agent) => (
              <ConsoleCard key={agent.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-blue-500/10 text-blue-300">
                    <Wrench size={16} />
                  </div>
                  <ConsoleStatus tone={agent.enabled ? "green" : "slate"}>{agent.enabled ? "Habilitado" : "Pausado"}</ConsoleStatus>
                </div>
                <h2 className="mt-4 text-[14px] font-bold text-[var(--text-primary)]">{agent.name || "—"}</h2>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{agent.segment?.join(", ") || "Sem segmento"}</p>
                <p className="mt-3 font-data text-[12px] text-[var(--text-secondary)]">{(agent as any).waPhone ?? "-"}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Mini label="Leads" value={(agent as any).totalLeads ?? 0} />
                  <Mini label="Ativos" value={agent.activeLeads} />
                  <Mini label="Conv." value={agent.conversations} />
                </div>
                <div className="mt-4 flex gap-2">
                  <ConsoleButton
                    className="flex-1"
                    icon={MessageSquare}
                    onClick={() => setSelectedAgent({ id: agent.id, name: agent.name })}
                  >
                    Conversas
                  </ConsoleButton>
                </div>
                {/* Fecha o circuito com /atendimento: o agente de IA e o inbox
                    do Chatwoot para onde ele passa a conversa no handoff eram
                    duas listas sem chave em comum. */}
                {agent.chatwootInboxId != null && (
                  <Link
                    href={`/atendimento?inboxId=${agent.chatwootInboxId}`}
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:border-blue-500/50 hover:text-blue-300"
                  >
                    <Inbox size={12} /> Inbox no Chatwoot
                  </Link>
                )}
              </ConsoleCard>
            ))}
          </section>

          <ConsoleCard pad={false}>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Métricas de Performance</h2>
              <p className="text-[11px] text-[var(--text-muted)]">Baseadas nos dados operacionais disponiveis</p>
            </div>
            <ConsoleTable headers={["Indicador", "Valor atual", "Status"]}>
              <MetricRow icon={MessageSquare} label="Conversas iniciadas" value={data.agents.reduce((s, a) => s + a.conversations, 0)} status="Mapeado" />
              <MetricRow icon={CheckCircle2} label="Leads ativos" value={data.agents.reduce((s, a) => s + a.activeLeads, 0)} status="Bom" />
              <MetricRow icon={Pause} label="Agentes pausados" value={data.agents.filter((a) => !a.enabled).length} status="Atenção" tone="amber" />
              <MetricRow icon={Clock} label="Última atividade" value={formatDateTime(data.agents.find((a) => a.lastActivityAt)?.lastActivityAt)} status="Monitorado" />
            </ConsoleTable>
          </ConsoleCard>
        </>
      )}

      <AgentConversationsDrawer
        agentId={selectedAgent?.id ?? null}
        agentName={selectedAgent?.name ?? null}
        onClose={() => setSelectedAgent(null)}
      />
    </ConsolePage>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[6px] bg-[var(--bg-inset)] p-2">
      <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
      <p className="font-data text-[16px] font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  status,
  tone = "green",
}: {
  icon: typeof Bot;
  label: string;
  value: React.ReactNode;
  status: string;
  tone?: "green" | "amber";
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Icon size={14} className="text-[var(--text-muted)]" />
          {label}
        </div>
      </td>
      <td className="px-3 py-3 font-data font-bold text-[var(--text-primary)]">{value}</td>
      <td className="px-3 py-3"><ConsoleStatus tone={tone}>{status}</ConsoleStatus></td>
    </tr>
  );
}
