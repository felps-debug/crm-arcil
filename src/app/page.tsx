"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  DollarSign,
  MessageCircle,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsolePage,
  ConsoleStatus,
} from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { useSupabase } from "@/hooks/use-supabase";
import { createClient } from "@/lib/supabase/client";
import { getRecentActivity } from "@/lib/supabase/queries";
import { formatRelativeTime } from "@/lib/utils";
import { SEGMENT_LABELS_API } from "@/lib/server/crm-labels";
import type { ApiBreakdownItem, ApiMetric, DashboardSummaryResponse } from "@/types/api";

function metricValue(value: number | string, unit?: string) {
  if (unit === "BRL") return formatMoney(value);
  if (unit === "%") return `${formatNumber(value)}%`;
  return formatNumber(value);
}

/** Ícone e cor por id da métrica, não por posição no array — antes era
 * [Users, Zap, ...][index], então qualquer reordenação na API trocava o ícone
 * de todos os cards. */
const METRIC_STYLE: Record<string, { icon: LucideIcon; tone: "blue" | "green" | "amber" | "red" | "violet" }> = {
  total_leads: { icon: Users, tone: "blue" },
  active_leads: { icon: Zap, tone: "green" },
  potential_revenue: { icon: DollarSign, tone: "amber" },
  followup_response_rate: { icon: BarChart3, tone: "violet" },
  agents_enabled: { icon: Bot, tone: "red" },
};

const TONES = {
  blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  red: "text-red-400 bg-red-500/10 border-red-500/20",
  violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
} as const;

function drilldownHref(metric: ApiMetric) {
  const params = new URLSearchParams(metric.drilldown.filters);
  const qs = params.toString();
  return qs ? `${metric.drilldown.href}?${qs}` : metric.drilldown.href;
}

export default function DashboardPage() {
  // Bump on any lead/sale/billing change so the dashboard updates live instead
  // of only on a manual refresh — same postgres_changes pattern used in /cobranca.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => setRefreshTick((t) => t + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => setRefreshTick((t) => t + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "billing" }, () => setRefreshTick((t) => t + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, () => setRefreshTick((t) => t + 1))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary${refreshTick ? `?_r=${refreshTick}` : ""}`);
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), [refreshTick]);

  const loading = summary.loading;
  const error = summary.error;
  const metrics = summary.data?.metrics ?? [];
  const indicators = summary.data?.commercialIndicators ?? [];
  const funnel = summary.data?.commercialFunnel ?? [];
  const series = summary.data?.leadsPerDay ?? [];

  return (
    <ConsolePage
      title="Dashboard"
      subtitle="Visão central da operação"
      actions={
        summary.data && (
          <span className="font-data text-[11px] text-[var(--text-muted)]">
            Atualizado {formatRelativeTime(summary.data.generatedAt)}
          </span>
        )
      }
    >
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <LeadsTrend series={series} label={summary.data?.period.label ?? ""} />
            <Funnel items={funnel} />
          </section>

          <ConsoleCard>
            <CardHeader icon={TrendingUp} title="Indicadores Comerciais" tone="emerald" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {indicators.map((m) => (
                <Link
                  key={m.id}
                  href={drilldownHref(m)}
                  title={`${m.tooltip}\n\nFórmula: ${m.formula}`}
                  className="group rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-3 transition-colors hover:border-blue-500/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{m.label}</p>
                    <ArrowRight size={12} className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-2 font-data text-[24px] font-bold leading-none text-[var(--text-primary)]">
                    {metricValue(m.value, m.unit)}
                  </p>
                  <Delta comparison={m.previous} unit={m.unit} />
                </Link>
              ))}
            </div>
          </ConsoleCard>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Breakdown title="Leads por Segmento" items={summary.data?.breakdowns.leadsBySegment ?? []} filterKey="segment" />
            <Breakdown title="Leads por Status" items={summary.data?.breakdowns.leadsByStatus ?? []} filterKey="status" />
            <Breakdown title="Origem dos Leads" items={summary.data?.breakdowns.leadsByOrigin ?? []} filterKey="origin" />
          </section>

          <ConsoleCard pad={false}>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <CardHeader icon={Activity} title="Atividade Recente" tone="blue" flush />
            </div>
            {loadingActivity ? (
              <div className="p-4">
                <ConsoleLoading />
              </div>
            ) : !activity?.length ? (
              <EmptyState message="Nenhuma atividade nos últimos registros." />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {activity.map((item, i) => {
                  const Icon = item.type === "lead" ? UserPlus : item.type === "cobranca" ? Receipt : MessageCircle;
                  const tone =
                    item.type === "lead"
                      ? "text-blue-400 bg-blue-500/10"
                      : item.type === "cobranca"
                      ? "text-amber-400 bg-amber-500/10"
                      : "text-emerald-400 bg-emerald-500/10";
                  return (
                    <div key={`${item.id}-${i}`} className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[6px] ${tone}`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                        {item.sub && (
                          // sub vem cru do banco (NEW, CONSUMER…) — traduz para o
                          // mesmo rótulo que o resto da UI mostra.
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {SEGMENT_LABELS_API[item.sub] ?? item.sub}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-data text-[11px] text-[var(--text-muted)]">{formatRelativeTime(item.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </ConsoleCard>
        </>
      )}
    </ConsolePage>
  );
}

function CardHeader({
  icon: Icon,
  title,
  tone,
  action,
  flush,
}: {
  icon: LucideIcon;
  title: string;
  tone: "emerald" | "blue";
  action?: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${flush ? "" : "mb-4"}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} className={tone === "emerald" ? "text-emerald-300" : "text-blue-300"} />
        <h2 className="text-[13px] font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-10 text-center text-[12px] text-[var(--text-muted)]">{message}</p>;
}

/** Delta com sinal e cor. Reserva a linha mesmo quando não há comparação, senão
 * cards com e sem delta ficam com alturas diferentes na mesma fileira. */
function Delta({ comparison, unit }: { comparison: ApiMetric["previous"]; unit?: string }) {
  const delta = comparison.deltaPercent;
  if (delta == null) {
    return <div className="mt-2 h-[15px] text-[11px] text-[var(--text-muted)]">—</div>;
  }
  const positive = delta >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`mt-2 flex h-[15px] items-center gap-1 text-[11px] font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
      <Icon size={12} />
      {positive ? "+" : ""}
      {delta}%
      <span className="font-normal text-[var(--text-muted)]">
        vs {comparison.value != null ? metricValue(comparison.value, unit) : "ant."}
      </span>
    </div>
  );
}

function MetricCard({ metric }: { metric: ApiMetric }) {
  const style = METRIC_STYLE[metric.id] ?? { icon: Activity, tone: "blue" as const };
  const Icon = style.icon;
  return (
    <Link
      href={drilldownHref(metric)}
      title={`${metric.tooltip}\n\nFórmula: ${metric.formula}`}
      className="group block rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-blue-500/60"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-[var(--text-muted)]">{metric.label}</p>
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border ${TONES[style.tone]}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="mt-4 font-data text-[28px] font-bold leading-none text-[var(--text-primary)]">
        {metricValue(metric.value, metric.unit)}
      </div>
      <div className="flex items-end justify-between gap-2">
        <Delta comparison={metric.previous} unit={metric.unit} />
        <span className="mb-px shrink-0 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
          {metric.period.label}
        </span>
      </div>
    </Link>
  );
}

/** Funil de verdade: cada etapa é proporcional ao TOPO (não ao maior valor), e
 * entre etapas mostra a taxa de conversão. A versão anterior desenhava 5 barras
 * independentes com largura mínima de 6%, então quatro etapas zeradas ficavam
 * visualmente idênticas e o funil não afunilava. */
function Funnel({ items }: { items: ApiBreakdownItem[] }) {
  const top = items[0]?.value ?? 0;

  return (
    <ConsoleCard className="flex flex-col">
      <CardHeader icon={BarChart3} title="Funil Comercial" tone="blue" />
      {top === 0 ? (
        <EmptyState message="Nenhum lead recebido ainda." />
      ) : (
        <div className="flex-1">
          {items.map((item, i) => {
            const share = (item.value / top) * 100;
            const previous = i > 0 ? items[i - 1] : null;
            const conversion = previous && previous.value > 0 ? (item.value / previous.value) * 100 : null;
            return (
              <div key={item.id}>
                {conversion != null && (
                  <div className="flex items-center gap-1.5 py-1 pl-3 text-[10px] text-[var(--text-muted)]">
                    <ArrowDownRight size={11} className={conversion === 0 ? "text-red-400/70" : "text-[var(--text-muted)]"} />
                    <span className={conversion === 0 ? "font-data text-red-400/90" : "font-data"}>
                      {Math.round(conversion * 10) / 10}%
                    </span>
                    <span>de conversão</span>
                  </div>
                )}
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
                    <span className="font-data font-bold text-[var(--text-primary)]">{formatNumber(item.value)}</span>
                  </div>
                  {/* Barra centrada: dá a silhueta de funil e distingue 0 de 1. */}
                  <div className="flex h-6 items-center justify-center rounded-[4px] bg-[var(--bg-subtle)]">
                    {item.value > 0 ? (
                      <div
                        className="h-full rounded-[4px] bg-gradient-to-r from-blue-500/70 to-blue-400"
                        style={{ width: `${Math.max(share, 3)}%` }}
                      />
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">vazio</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ConsoleCard>
  );
}

/** Sparkline em SVG puro. Recharts está na stack mas puxa ~90 KB só para uma
 * série de 30 pontos sem interação — não compensa aqui. */
function LeadsTrend({ series, label }: { series: { date: string; value: number }[]; label: string }) {
  const { path, area, max, total, peak } = useMemo(() => {
    const values = series.map((p) => p.value);
    const maxValue = Math.max(...values, 1);
    const w = 100;
    const h = 100;
    const step = series.length > 1 ? w / (series.length - 1) : w;
    const points = series.map((p, i) => `${(i * step).toFixed(2)},${(h - (p.value / maxValue) * h).toFixed(2)}`);
    return {
      path: points.length ? `M${points.join(" L")}` : "",
      area: points.length ? `M0,${h} L${points.join(" L")} L${w},${h} Z` : "",
      max: maxValue,
      total: values.reduce((sum, v) => sum + v, 0),
      peak: series.reduce((best, p) => (p.value > best.value ? p : best), series[0] ?? { date: "", value: 0 }),
    };
  }, [series]);

  return (
    <ConsoleCard className="flex flex-col">
      <CardHeader
        icon={TrendingUp}
        title="Leads por Dia"
        tone="emerald"
        action={<ConsoleStatus tone="slate">{label}</ConsoleStatus>}
      />
      {total === 0 ? (
        <EmptyState message="Nenhum lead criado no período." />
      ) : (
        <>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="font-data text-[28px] font-bold leading-none text-[var(--text-primary)]">{formatNumber(total)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">no período</p>
            </div>
            <div className="ml-auto text-right">
              <p className="font-data text-[15px] font-bold leading-none text-emerald-300">{formatNumber(max)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">pico em {formatDay(peak.date)}</p>
            </div>
          </div>
          <div className="mt-4 flex-1">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[120px] w-full" role="img" aria-label="Leads criados por dia">
              <defs>
                <linearGradient id="leadsTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#leadsTrendFill)" />
              <path d={path} fill="none" stroke="rgb(52 211 153)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>{formatDay(series[0]?.date)}</span>
            <span>{formatDay(series[series.length - 1]?.date)}</span>
          </div>
        </>
      )}
    </ConsoleCard>
  );
}

function formatDay(iso: string | undefined) {
  if (!iso) return "-";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function Breakdown({ title, items, filterKey }: { title: string; items: ApiBreakdownItem[]; filterKey: string }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const shown = items.slice(0, 5);
  const rest = items.slice(5).reduce((sum, i) => sum + i.value, 0);

  return (
    <ConsoleCard className="flex min-h-[188px] flex-col">
      <h2 className="mb-4 text-[13px] font-bold text-[var(--text-primary)]">{title}</h2>
      {!items.length ? (
        <EmptyState message="Sem dados." />
      ) : (
        <div className="space-y-3">
          {shown.map((item) => {
            const share = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <Link
                key={item.id}
                href={`/leads?${filterKey}=${encodeURIComponent(item.id)}`}
                className="group block"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-data text-[var(--text-primary)]">
                    {formatNumber(item.value)}
                    <span className="ml-1.5 font-normal text-[var(--text-muted)]">{Math.round(share)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${share}%` }} />
                </div>
              </Link>
            );
          })}
          {/* Antes o slice(0,5) descartava a cauda em silêncio. */}
          {rest > 0 && (
            <p className="pt-1 text-[10px] text-[var(--text-muted)]">
              + {formatNumber(rest)} em {items.length - 5} outras categorias
            </p>
          )}
        </div>
      )}
    </ConsoleCard>
  );
}
