"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { ConsoleError, ConsoleLoading } from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { useSupabase } from "@/hooks/use-supabase";
import { createClient } from "@/lib/supabase/client";
import { getRecentActivity, getUrgentFollowupsCount } from "@/lib/supabase/queries";
import type { AgentSummaryResponse, ApiMetric, DashboardSummaryResponse, InventorySummaryResponse, PendingCenterResponse } from "@/types/api";
import styles from "./central-operational.module.css";

type BoardRow = { id: string; domain: string; state: string; owner: string; lastEvent: string; nextAction: string; tone: "blue" | "amber" | "green" | "violet" | "cyan" | "red" };

function metricValue(metric: ApiMetric | undefined, fallback = "—") {
  if (!metric) return fallback;
  if (metric.unit === "BRL") return formatMoney(metric.value);
  if (metric.unit === "%") return `${formatNumber(metric.value)}%`;
  return formatNumber(metric.value);
}

function firstBreakdown(items: DashboardSummaryResponse["breakdowns"]["leadsByStatus"]) {
  return items.length ? items.slice(0, 2).map((item) => `${item.label}: ${item.value}`).join(" · ") : "Sem distribuição registrada";
}

export default function DashboardPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [urgentFollowups, setUrgentFollowups] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((tick) => tick + 1);
    const channel = supabase.channel("operacao-agora-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { getUrgentFollowupsCount().then(setUrgentFollowups); }, [refreshTick]);

  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const pending = useApi<PendingCenterResponse>(`/api/dashboard/pending-center${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const inventory = useApi<InventorySummaryResponse>(`/api/inventory/summary?limit=1${refreshTick ? `&_r=${refreshTick}` : ""}`);
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), [refreshTick]);
  const metrics = useMemo(() => new Map((summary.data?.metrics ?? []).map((metric) => [metric.id, metric])), [summary.data]);
  const now = summary.data?.generatedAt ? new Date(summary.data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";

  const rows = useMemo<BoardRow[]>(() => {
    const leadMetric = metrics.get("total_leads");
    const agentMetric = metrics.get("agents_enabled");
    const revenueMetric = metrics.get("potential_revenue");
    const followupMetric = metrics.get("followup_response_rate");
    const stockMetric = inventory.data?.metrics.find((metric) => metric.id === "total_products");
    return [
      { id: "leads", domain: "Leads", state: `${metricValue(leadMetric, "0")} na base`, owner: "Comercial", lastEvent: firstBreakdown(summary.data?.breakdowns.leadsByStatus ?? []), nextAction: "Acompanhar distribuição", tone: "blue" },
      { id: "agents", domain: "Agentes IA", state: `${metricValue(agentMetric, "0")} habilitados`, owner: "Automação", lastEvent: `${agents.data?.agents.filter((agent) => agent.enabled).length ?? 0} agentes ativos no cadastro`, nextAction: "Monitorar conversas", tone: "violet" },
      { id: "billing", domain: "Cobranças", state: metricValue(revenueMetric, "R$ 0,00"), owner: "Financeiro", lastEvent: urgentFollowups ? `${urgentFollowups} follow-up(s) aguardando decisão` : "Sem follow-up urgente", nextAction: urgentFollowups ? "Tratar fila pendente" : "Acompanhar carteira", tone: urgentFollowups ? "amber" : "green" },
      { id: "followups", domain: "Follow-ups", state: `${metricValue(followupMetric, "0")}% responderam`, owner: "Automação", lastEvent: `${pending.data?.items.find((item) => item.id === "followups_overdue")?.count ?? 0} fora do prazo`, nextAction: "Ver contatos em espera", tone: "cyan" },
      { id: "stock", domain: "Estoque", state: inventory.data?.estoqueSincronizado ? `${metricValue(stockMetric, "0")} produtos` : "ERP sem quantidade", owner: "ERP", lastEvent: inventory.data?.estoqueSincronizado ? "Saldo sincronizado" : "Aguardando saldo do ERP", nextAction: "Conferir demanda", tone: "green" },
      { id: "service", domain: "Atendimento", state: `${activity?.length ?? 0} eventos recentes`, owner: "IA + humano", lastEvent: activity?.[0]?.label ?? "Sem evento recente", nextAction: "Acompanhar conversas", tone: "red" },
    ];
  }, [activity, agents.data?.agents, inventory.data, metrics, pending.data?.items, summary.data?.breakdowns.leadsByStatus, urgentFollowups]);

  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.brand}>ARCIL</div><h1>Operação agora</h1><div className={styles.clock}><time>{now}</time><span><i /> AO VIVO</span></div></header>
    {summary.loading && <ConsoleLoading />}{summary.error && <ConsoleError message={summary.error} />}
    {!summary.loading && !summary.error && <>
      <section className={styles.attention} data-active={urgentFollowups > 0} aria-live="polite">
        <span>{urgentFollowups > 0 ? "ATENÇÃO OPERACIONAL" : "SITUAÇÃO OPERACIONAL"}</span>
        <b>{urgentFollowups > 0 ? `${urgentFollowups} follow-up(s) urgente(s) exigem decisão antes do próximo contato automático.` : "Nenhum follow-up urgente sinalizado neste momento."}</b>
        <small>{urgentFollowups > 0 ? "A fila abaixo mostra o volume por tipo de pendência." : "O quadro abaixo permanece atualizado enquanto a operação acontece."}</small>
      </section>
      <div className={styles.wall}>
        <aside className={styles.queues} aria-label="Filas abertas">
          <section><div className={styles.sectionHeading}><span>Filas abertas</span><strong>{pending.data?.items.reduce((total, item) => total + item.count, 0) ?? 0}</strong></div><div className={styles.queueRows}>{(pending.data?.items ?? []).map((item) => <div className={styles.queueRow} key={item.id} data-severity={item.severity}><span>{item.label}</span><b>{item.count}</b></div>)}{!pending.data?.items.length && <p className={styles.empty}>Carregando filas…</p>}</div></section>
          <section><div className={styles.sectionHeading}><span>Agentes no quadro</span><strong>{agents.data?.agents.length ?? 0}</strong></div><div className={styles.agentRows}>{(agents.data?.agents ?? []).map((agent) => <div className={styles.agentRow} key={agent.id}><i data-enabled={agent.enabled} /><span><b>{agent.name}</b><small>{agent.activeLeads} lead(s) ativos · {agent.conversations} conversa(s)</small></span></div>)}{!agents.data?.agents.length && <p className={styles.empty}>Nenhum agente cadastrado.</p>}</div></section>
        </aside>
        <section className={styles.board} aria-label="Agenda operacional"><div className={styles.boardHeading}><span>Agenda operacional</span><div>Estado atual <b>·</b> Responsável <b>·</b> Último sinal <b>·</b> Próximo passo</div></div><div className={styles.boardColumns} aria-hidden="true"><span>Domínio</span><span>Estado atual</span><span>Responsável</span><span>Último sinal</span><span>Próximo passo</span></div><div className={styles.boardRows}>{rows.map((row) => <div className={styles.boardRow} data-tone={row.tone} key={row.id}><span className={styles.domain}>{row.domain}</span><span className={styles.state}>{row.state}</span><span className={styles.owner}>{row.owner}</span><span className={styles.event}>{row.lastEvent}</span><span className={styles.action}>{row.nextAction}</span></div>)}</div><div className={styles.boardFoot}><Radio size={14} /> Atualização automática por Supabase, n8n, Chatwoot e ERP quando houver dados disponíveis.</div></section>
        <aside className={styles.stream} aria-label="Fluxo de eventos"><div className={styles.sectionHeading}><span>Fluxo de eventos</span><strong>{activity?.length ?? 0}</strong></div><div className={styles.streamLabels}><span>Hora</span><span>Origem</span><span>Evento</span></div>{loadingActivity ? <p className={styles.empty}>Carregando eventos…</p> : (activity ?? []).map((item, index) => <div className={styles.streamRow} data-type={item.type} key={`${item.id}-${index}`}><time>{item.date ? new Date(item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</time><span>{item.type}</span><b>{item.label}{item.sub ? ` · ${item.sub}` : ""}</b></div>)}{!loadingActivity && !activity?.length && <p className={styles.empty}>Nenhuma atividade recente.</p>}</aside>
      </div>
      <section className={styles.footerBoard} aria-label="Resumo operacional"><div><span>Situação</span><b data-ok={urgentFollowups === 0}>{urgentFollowups ? "atenção" : "estável"}</b></div><div><span>Follow-ups urgentes</span><b>{urgentFollowups}</b></div><div><span>Leads qualificados</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "qualified")?.value ?? 0}</b></div><div><span>Propostas</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "quoted")?.value ?? 0}</b></div><div><span>Vendas fechadas</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "closed")?.value ?? 0}</b></div><div><span>Estoque</span><b>{inventory.data?.estoqueSincronizado ? "sincronizado" : "aguardando ERP"}</b></div></section>
    </>}
  </main>;
}
