"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Bot, CircleAlert, RefreshCw, Tv, Users } from "lucide-react";
import { ConsoleError, ConsoleLoading } from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { useSupabase } from "@/hooks/use-supabase";
import { createClient } from "@/lib/supabase/client";
import { getRecentActivity, getUrgentFollowupsCount } from "@/lib/supabase/queries";
import type { AgentSummaryResponse, ApiMetric, DashboardSummaryResponse, InventorySummaryResponse, PendingCenterResponse } from "@/types/api";
import styles from "./central-operational.module.css";

function metricValue(metric: ApiMetric | undefined, fallback = "—") {
  if (!metric) return fallback;
  if (metric.unit === "BRL") return formatMoney(metric.value);
  if (metric.unit === "%") return `${formatNumber(metric.value)}%`;
  return formatNumber(metric.value);
}

export default function DashboardPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [urgentFollowups, setUrgentFollowups] = useState(0);
  const [realtimeState, setRealtimeState] = useState<"connecting" | "live" | "paused">("connecting");
  const [tvMode, setTvMode] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((tick) => tick + 1);
    const channel = supabase.channel("operacao-agora-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeState("paused");
      });
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { getUrgentFollowupsCount().then(setUrgentFollowups); }, [refreshTick]);

  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const pending = useApi<PendingCenterResponse>(`/api/dashboard/pending-center${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const inventory = useApi<InventorySummaryResponse>(`/api/inventory/summary?limit=1${refreshTick ? `&_r=${refreshTick}` : ""}`);
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), [refreshTick]);
  const metrics = useMemo(() => new Map((summary.data?.metrics ?? []).map((metric) => [metric.id, metric])), [summary.data]);
  const activeAgents = agents.data?.agents.filter((agent) => agent.enabled) ?? [];
  const leadMetric = metrics.get("total_leads");
  const openQueue = pending.data?.items.reduce((total, item) => total + item.count, 0) ?? 0;
  const now = summary.data?.generatedAt ? new Date(summary.data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const funnelMax = Math.max(...(summary.data?.commercialFunnel ?? []).map((item) => item.value), 1);

  return <main className={styles.page} data-mode={tvMode ? "tv" : "standard"}>
    <header className={styles.header}><div className={styles.headerIdentity}><span className={styles.brand}>ARCIL</span><div><p className={styles.eyebrow}>AGENTES IA · LEADS · OPERAÇÃO COMERCIAL</p><h1>O que está acontecendo com os leads?</h1><p className={styles.subtitle}>Acompanhe quem está atendendo, quantas oportunidades estão em movimento e onde a equipe precisa agir.</p></div></div><div className={styles.headerActions}><div className={styles.time}><time>{now}</time><span data-state={realtimeState}><i /> {realtimeState === "live" ? "AO VIVO" : realtimeState === "paused" ? "PAUSADO" : "CONECTANDO"}</span></div><button className={styles.iconButton} type="button" onClick={() => setRefreshTick((tick) => tick + 1)} aria-label="Atualizar painel"><RefreshCw size={16} /></button><button className={styles.modeButton} type="button" onClick={() => setTvMode((mode) => !mode)} aria-pressed={tvMode}><Tv size={15} /> {tvMode ? "Sair do modo TV" : "Modo TV"}</button></div></header>
    {summary.loading || agents.loading ? <ConsoleLoading /> : null}{summary.error && <ConsoleError message={summary.error} />}{!summary.loading && !agents.loading && !summary.error && <>
      <section className={styles.hero} aria-labelledby="hero-title"><div className={styles.heroCopy}><div className={styles.heroLabel}><Bot size={15} /> AGENTES IA EM OPERAÇÃO</div><h2 id="hero-title">A inteligência está trabalhando na sua carteira.</h2><p>{activeAgents.length} agentes ativos acompanham {metricValue(leadMetric, "0")} leads na base. Veja abaixo onde a operação está avançando e quais conversas pedem atenção.</p><div className={styles.heroStatus}><span className={styles.statusDot} /> {realtimeState === "live" ? "Dados atualizados em tempo real" : "Atualização aguardando conexão"}</div></div><div className={styles.heroNumbers}><div><span>AGENTES ATIVOS</span><strong>{activeAgents.length}</strong></div><div><span>LEADS NA BASE</span><strong>{metricValue(leadMetric, "0")}</strong></div><div><span>CONVERSAS</span><strong>{formatNumber(activeAgents.reduce((total, agent) => total + agent.conversations, 0))}</strong></div></div></section>
      <div className={styles.mainGrid}><section className={styles.agentsPanel} aria-labelledby="agents-title"><div className={styles.panelHeader}><div><p className={styles.eyebrow}>MONITORAMENTO DOS AGENTES</p><h2 id="agents-title">Quem está trabalhando agora</h2></div><span className={styles.panelMeta}>{agents.data?.agents.length ?? 0} cadastrados</span></div><div className={styles.agentGrid}>{(agents.data?.agents ?? []).map((agent) => <div className={styles.agentCard} data-active={agent.enabled} key={agent.id}><div className={styles.agentTop}><span className={styles.agentSignal} /><div><h3>{agent.name}</h3><p>{agent.segment?.join(" · ") || "Segmento não definido"}</p></div><span className={styles.agentState}>{agent.enabled ? "ATIVO" : "PAUSADO"}</span></div><div className={styles.agentStats}><div><b>{agent.activeLeads}</b><span>leads ativos</span></div><div><b>{agent.conversations}</b><span>conversas</span></div><div><b>{agent.lostLeads}</b><span>perdidos</span></div></div><div className={styles.agentAction}>Ver carteira do agente <ArrowUpRight size={14} /></div></div>)}</div></section><aside className={styles.sideColumn}><section className={styles.leadsPanel} aria-labelledby="leads-title"><div className={styles.panelHeader}><div><p className={styles.eyebrow}>RESULTADO DA IA</p><h2 id="leads-title">Leads no funil</h2></div><Users size={17} /></div><div className={styles.funnel}>{(summary.data?.commercialFunnel ?? []).map((item) => <div className={styles.funnelRow} key={item.id}><div><span>{item.label}</span><b>{formatNumber(item.value)}</b></div><div className={styles.funnelTrack}><i style={{ width: `${Math.max((item.value / funnelMax) * 100, item.value ? 8 : 0)}%` }} /></div></div>)}</div></section><section className={styles.billingPanel} aria-labelledby="billing-title"><div className={styles.panelHeader}><div><p className={styles.eyebrow}>SINAL FINANCEIRO</p><h2 id="billing-title">Cobranças</h2></div><span className={styles.smallSignal}>{urgentFollowups}</span></div><div className={styles.billingValue}>{metricValue(metrics.get("potential_revenue"), "R$ 0,00")}</div><p>{urgentFollowups ? `${urgentFollowups} follow-up(s) urgente(s)` : "Sem cobrança urgente agora"}</p></section></aside></div>
      <div className={styles.bottomGrid}><section className={styles.priorityPanel} aria-labelledby="priority-title"><div className={styles.panelHeader}><div><p className={styles.eyebrow}>FILA DE TRABALHO</p><h2 id="priority-title">Onde os leads precisam de ação</h2></div><CircleAlert size={17} /></div><div className={styles.priorityList}>{(pending.data?.items ?? []).filter((item) => item.count > 0).slice(0, 6).map((item) => <div className={styles.priorityRow} key={item.id}><span>{item.label}</span><b data-severity={item.severity}>{formatNumber(item.count)}</b><small>abrir fila <ArrowUpRight size={13} /></small></div>)}{!openQueue && <p className={styles.empty}>Nenhuma fila pendente.</p>}</div></section><section className={styles.eventsPanel} aria-labelledby="events-title"><div className={styles.panelHeader}><div><p className={styles.eyebrow}>TEMPO REAL</p><h2 id="events-title">Últimos movimentos</h2></div><span className={styles.panelMeta}>{activity?.length ?? 0} eventos</span></div>{loadingActivity ? <p className={styles.empty}>Carregando eventos…</p> : (activity ?? []).slice(0, 5).map((item, index) => <div className={styles.eventRow} data-type={item.type} key={`${item.id}-${index}`}><time>{item.date ? new Date(item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</time><span>{item.type}</span><b>{item.label}{item.sub ? ` · ${item.sub}` : ""}</b></div>)}{!loadingActivity && !activity?.length && <p className={styles.empty}>Nenhuma atividade recente.</p>}</section></div>
      <section className={styles.ledger} aria-label="Resumo do negócio"><div><span>LEADS QUALIFICADOS</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "qualified")?.value ?? 0}</b></div><div><span>PROPOSTAS</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "quoted")?.value ?? 0}</b></div><div><span>VENDAS FECHADAS</span><b>{summary.data?.commercialFunnel.find((item) => item.id === "closed")?.value ?? 0}</b></div><div><span>ESTOQUE</span><b>{inventory.data?.estoqueSincronizado ? "sincronizado" : "aguardando ERP"}</b></div></section>
    </>}
  </main>;
}
