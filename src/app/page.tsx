"use client";

import { Activity, BarChart3, Bot, DollarSign, MessageCircle, Receipt, TrendingUp, UserPlus, Users, Zap } from "lucide-react";
import {
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsoleMetric,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { useSupabase } from "@/hooks/use-supabase";
import { getRecentActivity } from "@/lib/supabase/queries";
import { formatRelativeTime } from "@/lib/utils";
import type { DashboardSummaryResponse } from "@/types/api";

function metricValue(value: number | string, unit?: string) {
  if (unit === "BRL") return formatMoney(value);
  if (unit === "%") return `${formatNumber(value)}%`;
  return formatNumber(value);
}

function toneForIndex(index: number): "blue" | "green" | "amber" | "red" | "violet" {
  return (["blue", "green", "amber", "red", "violet"] as const)[index % 5];
}

export default function DashboardPage() {
  const summary = useApi<DashboardSummaryResponse>("/api/dashboard/summary");
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), []);

  const loading = summary.loading;
  const error = summary.error;
  const metrics = summary.data?.metrics ?? [];
  const indicators = summary.data?.commercialIndicators ?? [];

  return (
    <ConsolePage title="Dashboard" subtitle="Visao central da operacao">
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.slice(0, 5).map((m, index) => (
              <ConsoleMetric
                key={m.id}
                label={m.label}
                value={metricValue(m.value, m.unit)}
                helper={m.previous.deltaPercent != null ? `${m.previous.deltaPercent > 0 ? "+" : ""}${m.previous.deltaPercent}% vs ant.` : undefined}
                icon={[Users, Zap, DollarSign, BarChart3, Bot][index]}
                tone={toneForIndex(index)}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <ConsoleCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Funil Comercial</h2>
                <ConsoleStatus tone="slate">Compacto</ConsoleStatus>
              </div>
              <div className="space-y-4">
                {(summary.data?.commercialFunnel ?? []).map((item) => {
                  const max = Math.max(...(summary.data?.commercialFunnel ?? []).map((i) => i.value), 1);
                  return (
                    <div key={item.id}>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-[var(--text-secondary)]">{item.label}</span>
                        <span className="font-data text-[var(--text-primary)]">{formatNumber(item.value)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                        <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ConsoleCard>

            <ConsoleCard>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-emerald-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Indicadores Comerciais</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {indicators.map((m) => (
                  <div key={m.id} title={m.tooltip} className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{m.label}</p>
                    <p className="mt-2 font-data text-[24px] font-bold text-[var(--text-primary)]">{metricValue(m.value, m.unit)}</p>
                  </div>
                ))}
              </div>
            </ConsoleCard>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Breakdown title="Leads por Segmento" items={summary.data?.breakdowns.leadsBySegment ?? []} />
            <Breakdown title="Leads por Status" items={summary.data?.breakdowns.leadsByStatus ?? []} />
            <Breakdown title="Origem dos Leads" items={summary.data?.breakdowns.leadsByOrigin ?? []} />
          </section>

          <ConsoleCard pad={false}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <TrendingUp size={15} className="text-emerald-300" />
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Atividade Recente</h2>
            </div>
            {loadingActivity ? (
              <div className="p-4"><ConsoleLoading /></div>
            ) : !activity?.length ? (
              <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">Nenhuma atividade recente.</p>
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
                    <div key={`${item.id}-${i}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[6px] ${tone}`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                        {item.sub && <p className="truncate text-[11px] text-[var(--text-muted)]">{item.sub}</p>}
                      </div>
                      <span className="shrink-0 font-data text-[11px] text-[var(--text-muted)]">{formatRelativeTime(item.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </ConsoleCard>

          <ConsoleCard pad={false}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-[var(--text-muted)]" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Resumo Operacional</h2>
              </div>
              <a href="/leads" className="text-[12px] font-bold text-blue-300">Ver tudo</a>
            </div>
            <ConsoleTable headers={["Area", "Base", "Acao"]}>
              {metrics.slice(0, 4).map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3 font-semibold text-[var(--text-primary)]">{m.label}</td>
                  <td className="px-3 py-3 font-data text-[var(--text-secondary)]">{metricValue(m.value, m.unit)}</td>
                  <td className="px-3 py-3">
                    <a href="/leads" className="inline-block">
                      <ConsoleStatus tone="blue">Abrir</ConsoleStatus>
                    </a>
                  </td>
                </tr>
              ))}
            </ConsoleTable>
          </ConsoleCard>
        </>
      )}
    </ConsolePage>
  );
}

function Breakdown({ title, items }: { title: string; items: { id: string; label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ConsoleCard>
      <h2 className="mb-4 text-[13px] font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3">
        {items.slice(0, 5).map((item) => (
          <div key={item.id}>
            <div className="mb-1 flex justify-between text-[11px] font-semibold">
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              <span className="font-data text-[var(--text-primary)]">{formatNumber(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-subtle)]">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ConsoleCard>
  );
}
