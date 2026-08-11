"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  CircleDollarSign,
  ClipboardCheck,
  MessageSquareText,
  Radio,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConsoleError, ConsoleLoading } from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { useSupabase } from "@/hooks/use-supabase";
import { createClient } from "@/lib/supabase/client";
import { getRecentActivity, getUrgentFollowupsCount } from "@/lib/supabase/queries";
import { formatRelativeTime } from "@/lib/utils";
import type { ApiMetric, DashboardSummaryResponse } from "@/types/api";
import styles from "./central-operational.module.css";

type Tone = "blue" | "green" | "amber" | "violet" | "cyan" | "red";

type Lane = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
  metricId?: string;
  fallback: string;
  detail: string;
};

const LANES: Lane[] = [
  { id: "leads", label: "Leads", href: "/leads", icon: Users, tone: "blue", metricId: "total_leads", fallback: "0", detail: "base comercial" },
  { id: "agents", label: "Agentes IA", href: "/agentes", icon: Bot, tone: "violet", metricId: "agents_enabled", fallback: "0", detail: "agentes ativos" },
  { id: "billing", label: "Cobranças", href: "/cobranca", icon: CircleDollarSign, tone: "amber", metricId: "potential_revenue", fallback: "R$ 0,00", detail: "em potencial" },
  { id: "followups", label: "Follow-ups", href: "/cobranca", icon: ClipboardCheck, tone: "cyan", metricId: "followup_response_rate", fallback: "0%", detail: "taxa de resposta" },
  { id: "stock", label: "Estoque", href: "/demanda-estoque", icon: Boxes, tone: "green", fallback: "—", detail: "aguarda sincronização" },
  { id: "service", label: "Atendimento", href: "/atendimento", icon: MessageSquareText, tone: "red", fallback: "0", detail: "eventos recentes" },
];

function metricValue(metric: ApiMetric | undefined, fallback: string) {
  if (!metric) return fallback;
  if (metric.unit === "BRL") return formatMoney(metric.value);
  if (metric.unit === "%") return `${formatNumber(metric.value)}%`;
  return formatNumber(metric.value);
}

function metricChange(metric: ApiMetric | undefined) {
  const delta = metric?.previous.deltaPercent;
  if (delta == null) return null;
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

function metricTrend(metric: ApiMetric | undefined) {
  const delta = metric?.previous.deltaPercent;
  if (delta == null) return "flat";
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

export default function DashboardPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [urgentFollowups, setUrgentFollowups] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((tick) => tick + 1);
    const channel = supabase
      .channel("central-operacional-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "billing" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    getUrgentFollowupsCount().then(setUrgentFollowups);
  }, [refreshTick]);

  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), [refreshTick]);
  const metricsById = useMemo(() => new Map((summary.data?.metrics ?? []).map((metric) => [metric.id, metric])), [summary.data]);
  const generatedAt = summary.data?.generatedAt;

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div>
          <h1>Central Operacional</h1>
        </div>
        <div className={styles.liveMeta}>
          <span className={styles.liveBadge}><i /> Ao vivo</span>
          <span className={styles.updated}>{generatedAt ? `Atualizado ${formatRelativeTime(generatedAt)}` : "Conectando dados"}</span>
        </div>
      </header>

      {summary.loading && <ConsoleLoading />}
      {summary.error && <ConsoleError message={summary.error} />}

      {!summary.loading && !summary.error && (
        <>
          <section className={urgentFollowups > 0 ? styles.attentionCritical : styles.attentionClear} aria-live="polite">
            <div className={styles.attentionIcon}>{urgentFollowups > 0 ? <TriangleAlert size={21} /> : <Activity size={21} />}</div>
            <div className={styles.attentionCopy}>
              <strong>{urgentFollowups > 0 ? `${urgentFollowups} follow-up${urgentFollowups === 1 ? "" : "s"} exige${urgentFollowups === 1 ? "" : "m"} atenção` : "Operação sem pendência crítica sinalizada"}</strong>
              <span>{urgentFollowups > 0 ? "A fila precisa de uma decisão antes do próximo contato automático." : "Acompanhe os sinais abaixo para identificar oportunidades e exceções."}</span>
            </div>
            <Link href="/cobranca" className={styles.attentionAction}>
              Ver operação <ArrowRight size={17} />
            </Link>
          </section>

          <section className={styles.stage} aria-label="Panorama operacional por área">
            <div className={styles.laneList}>
              {LANES.map((lane) => {
                const metric = metricsById.get(lane.metricId ?? "");
                const Icon = lane.icon;
                const value = lane.id === "service" ? String(activity?.length ?? 0) : metricValue(metric, lane.fallback);
                const change = lane.id === "service" ? null : metricChange(metric);
                const trend = lane.id === "service" ? "flat" : metricTrend(metric);
                return (
                  <Link href={lane.href} key={lane.id} className={`${styles.lane} ${styles[`tone${lane.tone[0].toUpperCase()}${lane.tone.slice(1)}`]}`}>
                    <span className={styles.laneIcon}><Icon size={22} strokeWidth={1.8} /></span>
                    <span className={styles.laneName}>{lane.label}<small>{lane.detail}</small></span>
                    <span className={styles.laneMetric}>{value}<small>{change ?? "sem variação consolidada"}</small></span>
                    <span className={styles.laneSignal} data-trend={trend} aria-label={`Tendência ${trend === "up" ? "positiva" : trend === "down" ? "negativa" : "estável"}`}><b /><b /><b /><b /><b /><b /></span>
                    <span className={styles.laneNext}>{lane.id === "service" ? "Ver conversas e atividade" : metric?.period.label ?? "Abrir visão detalhada"}<ArrowRight size={17} /></span>
                  </Link>
                );
              })}
            </div>

            <aside className={styles.priorityRail}>
              <div className={styles.railHeader}><span>Atividade recente</span><strong>{activity?.length ?? 0}</strong></div>
              {loadingActivity ? <p className={styles.railEmpty}>Carregando eventos…</p> : !activity?.length ? <p className={styles.railEmpty}>Nenhum evento recente.</p> : activity.slice(0, 7).map((item, index) => (
                <Link href={item.type === "cobranca" ? "/cobranca" : item.type === "lead" ? "/leads" : "/atendimento"} className={styles.priorityItem} key={`${item.id}-${index}`}>
                  <span className={styles.priorityDot} data-type={item.type} />
                  <span><strong>{item.label}</strong>{item.sub && <small>{item.sub}</small>}</span>
                  <time>{formatRelativeTime(item.date)}</time>
                </Link>
              ))}
            </aside>
          </section>

          <section className={styles.rundown} aria-label="Rundown de atividade operacional">
            <div className={styles.rundownTitle}><Radio size={15} /> Fluxo operacional</div>
            <div className={styles.rundownEvents}>
              {(activity ?? []).slice(0, 6).map((item, index) => (
                <span key={`${item.id}-ticker-${index}`}><i data-type={item.type} />{item.label}</span>
              ))}
              {!activity?.length && <span><i />Aguardando a primeira atualização</span>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
