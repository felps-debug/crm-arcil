"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bot,
  DollarSign,
  MessageCircleReply,
  RefreshCw,
  Tv,
  Users,
} from "lucide-react";
import {
  ConsoleButton,
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
import { createClient } from "@/lib/supabase/client";
import { getRecentActivity, getUrgentFollowupsCount } from "@/lib/supabase/queries";
import type {
  AgentSummaryResponse,
  ApiMetric,
  DashboardSummaryResponse,
  InventorySummaryResponse,
  PendingCenterResponse,
  PendingSeverity,
} from "@/types/api";
import type { LiturgiaResponse } from "@/app/api/liturgia/route";
import { TvMode } from "./_components/tv-mode";

type Tone = "blue" | "green" | "amber" | "red" | "violet" | "slate";

/** Cada linha da agenda responde "o que está acontecendo neste domínio e qual é
 *  o próximo passo" — o mesmo conteúdo do quadro anterior, agora na tabela
 *  padrão do console para não abrir um segundo vocabulário visual no produto. */
type AgendaRow = {
  id: string;
  domain: string;
  state: string;
  owner: string;
  lastSignal: string;
  nextStep: string;
  href: string;
  tone: Tone;
};

const SEVERITY_TONE: Record<PendingSeverity, Tone> = {
  info: "blue",
  warning: "amber",
  danger: "red",
};

const ACTIVITY_TONE: Record<"lead" | "cobranca" | "followup", Tone> = {
  lead: "green",
  cobranca: "amber",
  followup: "blue",
};

function metricValue(metric: ApiMetric | undefined, fallback = "—") {
  if (!metric) return fallback;
  if (metric.unit === "BRL") return formatMoney(metric.value);
  if (metric.unit === "%") return `${formatNumber(metric.value)}%`;
  return formatNumber(metric.value);
}

function firstBreakdown(items: DashboardSummaryResponse["breakdowns"]["leadsByStatus"]) {
  return items.length
    ? items.slice(0, 2).map((item) => `${item.label}: ${item.value}`).join(" · ")
    : "Sem distribuição registrada";
}

function timeOf(date: string | null) {
  return date ? new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function DashboardPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [urgentFollowups, setUrgentFollowups] = useState(0);
  const [realtime, setRealtime] = useState<"connecting" | "live" | "paused">("connecting");
  const [tvMode, setTvMode] = useState(false);

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  useEffect(() => {
    const supabase = createClient();

    // O realtime emite um evento por LINHA alterada. Um disparo de cobrança do
    // n8n grava dezenas de linhas de uma vez, e sem isto cada uma refazia as
    // quatro chamadas do painel. Meio segundo agrupa o lote em uma atualização
    // só, sem que a tela pareça mais lenta para uma alteração isolada.
    let batch: ReturnType<typeof setTimeout> | undefined;
    const refreshBatched = () => {
      clearTimeout(batch);
      batch = setTimeout(refresh, 500);
    };

    const channel = supabase
      .channel("operacao-agora-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refreshBatched)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, refreshBatched)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refreshBatched)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refreshBatched)
      // Sem refletir o status da inscrição, o selo dizia "ao vivo" mesmo com o
      // canal derrubado — o pior estado possível num painel de operação.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime("paused");
      });
    return () => {
      clearTimeout(batch);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    getUrgentFollowupsCount().then(setUrgentFollowups);
  }, [refreshTick]);

  const suffix = refreshTick ? `?_r=${refreshTick}` : "";
  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary${suffix}`);
  const pending = useApi<PendingCenterResponse>(`/api/dashboard/pending-center${suffix}`);
  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary${suffix}`);
  // `scope=summary`: o painel só usa `estoqueSincronizado` e o total de
  // produtos, e a rota responde isso por contagem em vez de trazer o catálogo.
  const inventory = useApi<InventorySummaryResponse>(
    `/api/inventory/summary?scope=summary${refreshTick ? `&_r=${refreshTick}` : ""}`
  );
  const { data: activity, loading: loadingActivity } = useSupabase(() => getRecentActivity(), [refreshTick]);
  // Sem cache-busting: a liturgia é a mesma o dia inteiro e a rota já guarda
  // por data. Refazer a cada refresh só castigaria a fonte pública.
  const liturgia = useApi<LiturgiaResponse>("/api/liturgia");

  const metrics = useMemo(
    () => new Map((summary.data?.metrics ?? []).map((metric) => [metric.id, metric])),
    [summary.data]
  );

  const pendingItems = pending.data?.items ?? [];
  const openQueue = pendingItems.reduce((total, item) => total + item.count, 0);

  // A faixa de alerta só disparava por follow-up urgente. Isso está em zero
  // enquanto 6 dos 8 leads seguem sem responsável — ou seja, o maior problema
  // real da operação era o único que não aparecia. Agora, sem follow-up
  // urgente, a faixa mostra a pendência mais grave da fila.
  const attention = useMemo(() => {
    if (urgentFollowups > 0) {
      return {
        headline: `${urgentFollowups} follow-up(s) urgente(s) aguardando decisão`,
        detail: "Trate a fila antes do próximo contato automático da IA.",
        tone: "amber" as const,
      };
    }
    const rank: Record<string, number> = { danger: 0, warning: 1, info: 2 };
    const worst = [...pendingItems]
      .filter((item) => item.count > 0)
      .sort((a, b) => ((rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)) || b.count - a.count)[0];
    if (!worst) return null;
    return {
      headline: `${formatNumber(worst.count)} · ${worst.label}`,
      detail: worst.tooltip ?? "Abra a fila para tratar.",
      tone: worst.severity === "danger" ? ("red" as const) : ("amber" as const),
    };
  }, [pendingItems, urgentFollowups]);
  const funnel = summary.data?.commercialFunnel ?? [];
  const funnelMax = Math.max(...funnel.map((item) => item.value), 1);
  const clock = summary.data?.generatedAt
    ? new Date(summary.data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";

  const agenda = useMemo<AgendaRow[]>(() => {
    const stockMetric = inventory.data?.metrics.find((metric) => metric.id === "total_products");
    const overdue = pendingItems.find((item) => item.id === "followups_overdue")?.count ?? 0;
    const enabledAgents = agents.data?.agents.filter((agent) => agent.enabled).length ?? 0;
    return [
      {
        id: "leads",
        domain: "Leads",
        state: `${metricValue(metrics.get("total_leads"), "0")} na base`,
        owner: "Comercial",
        lastSignal: firstBreakdown(summary.data?.breakdowns.leadsByStatus ?? []),
        nextStep: "Acompanhar distribuição",
        href: "/leads",
        tone: "blue",
      },
      {
        id: "agents",
        domain: "Agentes IA",
        state: `${metricValue(metrics.get("agents_enabled"), "0")} habilitados`,
        owner: "Automação",
        lastSignal: `${enabledAgents} agente(s) ativo(s) no cadastro`,
        nextStep: "Monitorar conversas",
        href: "/agentes",
        tone: "violet",
      },
      {
        id: "billing",
        domain: "Cobranças",
        state: `${metricValue(metrics.get("received_revenue"), "R$ 0,00")} recebido`,
        owner: "Financeiro",
        lastSignal: `${metricValue(metrics.get("open_collections"), "R$ 0,00")} ainda em aberto`,
        nextStep: urgentFollowups ? "Tratar fila pendente" : "Acompanhar carteira",
        href: "/cobranca",
        tone: urgentFollowups ? "amber" : "green",
      },
      {
        id: "followups",
        domain: "Follow-ups",
        state: `${metricValue(metrics.get("followup_response_rate"), "0")} responderam`,
        owner: "Automação",
        lastSignal: `${overdue} fora do prazo`,
        nextStep: "Ver contatos em espera",
        href: "/cobranca",
        tone: overdue ? "amber" : "blue",
      },
      {
        id: "stock",
        domain: "Estoque",
        state: inventory.data?.estoqueSincronizado ? `${metricValue(stockMetric, "0")} produtos` : "ERP sem quantidade",
        owner: "ERP",
        lastSignal: inventory.data?.estoqueSincronizado ? "Saldo sincronizado" : "Aguardando saldo do ERP",
        nextStep: "Conferir demanda",
        href: "/demanda-estoque",
        tone: inventory.data?.estoqueSincronizado ? "green" : "slate",
      },
      {
        id: "service",
        domain: "Atendimento",
        state: `${activity?.length ?? 0} eventos recentes`,
        owner: "IA + humano",
        lastSignal: activity?.[0]?.label ?? "Sem evento recente",
        nextStep: "Acompanhar conversas",
        href: "/atendimento",
        tone: "blue",
      },
    ];
  }, [activity, agents.data?.agents, inventory.data, metrics, pendingItems, summary.data?.breakdowns.leadsByStatus, urgentFollowups]);

  const loading = summary.loading;

  return (
    <ConsolePage
      title="Dashboard"
      subtitle="Visão central da operação"
      actions={
        <>
          <ConsoleStatus tone={realtime === "live" ? "green" : realtime === "paused" ? "red" : "slate"}>
            {realtime === "live" ? "Ao vivo" : realtime === "paused" ? "Pausado" : "Conectando"}
          </ConsoleStatus>
          <span className="font-data text-[12px] font-semibold text-[var(--text-muted)]">{clock}</span>
          <ConsoleButton icon={RefreshCw} onClick={refresh} aria-label="Atualizar painel">
            Atualizar
          </ConsoleButton>
          <ConsoleButton icon={Tv} onClick={() => setTvMode(true)}>
            Modo TV
          </ConsoleButton>
        </>
      }
    >
      {loading && <ConsoleLoading />}
      {summary.error && <ConsoleError message={summary.error} />}

      {!loading && !summary.error && (
        <>
          {attention && (
            <ConsoleCard
              className={
                attention.tone === "red"
                  ? "flex items-center gap-3 border-red-500/30 bg-red-500/5"
                  : "flex items-center gap-3 border-amber-500/30 bg-amber-500/5"
              }
            >
              <AlertTriangle
                size={18}
                className="shrink-0"
                style={{ color: attention.tone === "red" ? "var(--red)" : "var(--amber)" }}
              />
              <div className="min-w-0">
                <p
                  className="text-[13px] font-bold"
                  style={{ color: attention.tone === "red" ? "var(--red)" : "var(--amber)" }}
                >
                  {attention.headline}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{attention.detail}</p>
              </div>
              <Link
                href={urgentFollowups > 0 ? "/cobranca" : "/leads"}
                className="ml-auto shrink-0 text-[11px] font-bold underline-offset-4 hover:underline"
                style={{ color: attention.tone === "red" ? "var(--red)" : "var(--amber)" }}
              >
                Abrir fila
              </Link>
            </ConsoleCard>
          )}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ConsoleMetric
              label="Total leads"
              value={metricValue(metrics.get("total_leads"), "0")}
              helper="base completa"
              icon={Users}
              tone="blue"
            />
            <ConsoleMetric
              label="Leads ativos"
              value={metricValue(metrics.get("active_leads"), "0")}
              helper="em atendimento"
              icon={Activity}
              tone="green"
            />
            <ConsoleMetric
              label="Agentes habilitados"
              value={metricValue(metrics.get("agents_enabled"), "0")}
              helper={`${agents.data?.agents.length ?? 0} cadastrados`}
              icon={Bot}
              tone="violet"
            />
            {/* Recebido e Em aberto no lugar de "Receita potencial": ela sai de
                `quotes`, que está vazia, então mostrava R$ 0,00 fixo. Estes dois
                saem das baixas de boleto — é dinheiro que existe. */}
            <ConsoleMetric
              label="Recebido"
              value={metricValue(metrics.get("received_revenue"), "R$ 0,00")}
              helper="boletos baixados"
              icon={DollarSign}
              tone="green"
            />
            <ConsoleMetric
              label="Em aberto"
              value={metricValue(metrics.get("open_collections"), "R$ 0,00")}
              helper={`${metricValue(metrics.get("followup_response_rate"), "0%")} responderam`}
              icon={MessageCircleReply}
              tone="amber"
            />
            {/* O total da fila já vive no painel "Filas abertas" ao lado, e é
                dominado por produtos sem estoque. O número que pede ação hoje é
                o de follow-ups urgentes — é ele que dispara o alerta acima. */}
            <ConsoleMetric
              label="Follow-ups urgentes"
              value={formatNumber(urgentFollowups)}
              helper={urgentFollowups ? "aguardando decisão" : "nada em atraso"}
              icon={AlertTriangle}
              tone={urgentFollowups ? "amber" : "slate"}
            />
          </section>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <ConsoleCard pad={false} className="xl:col-span-2">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Agenda operacional</h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Estado atual de cada domínio e o próximo passo de quem responde por ele
                </p>
              </div>
              <ConsoleTable headers={["Domínio", "Estado atual", "Responsável", "Último sinal", "Próximo passo"]}>
                {agenda.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-inset)]">
                    <td className="px-3 py-2.5">
                      <Link
                        href={row.href}
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-[var(--text-primary)] hover:text-blue-400"
                      >
                        {row.domain}
                        <ArrowUpRight size={12} />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <ConsoleStatus tone={row.tone}>{row.state}</ConsoleStatus>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[var(--text-secondary)]">{row.owner}</td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 text-[12px] text-[var(--text-muted)]" title={row.lastSignal}>
                      {row.lastSignal}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-semibold text-[var(--text-secondary)]">{row.nextStep}</td>
                  </tr>
                ))}
              </ConsoleTable>
            </ConsoleCard>

            <ConsoleCard pad={false}>
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Filas abertas</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">Pendências aguardando ação</p>
                </div>
                <span className="font-data text-[16px] font-bold text-[var(--text-primary)]">{formatNumber(openQueue)}</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {pendingItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.drilldown.href}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-inset)]"
                  >
                    <span className="truncate text-[12px] text-[var(--text-secondary)]" title={item.label}>
                      {item.label}
                    </span>
                    <ConsoleStatus tone={item.count ? SEVERITY_TONE[item.severity] : "slate"}>
                      {formatNumber(item.count)}
                    </ConsoleStatus>
                  </Link>
                ))}
                {!pendingItems.length && (
                  <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
                    Nenhuma fila configurada ainda.
                  </p>
                )}
              </div>
            </ConsoleCard>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <ConsoleCard pad={false}>
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Agentes no quadro</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">Carga atual por agente de IA</p>
                </div>
                <span className="font-data text-[16px] font-bold text-[var(--text-primary)]">
                  {agents.data?.agents.length ?? 0}
                </span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {(agents.data?.agents ?? []).map((agent) => (
                  <div key={agent.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full ${agent.enabled ? "bg-emerald-400" : "bg-[var(--text-muted)]"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold text-[var(--text-primary)]">{agent.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {agent.activeLeads} lead(s) ativos · {agent.conversations} conversa(s)
                      </p>
                    </div>
                    <ConsoleStatus tone={agent.enabled ? "green" : "slate"}>
                      {agent.enabled ? "Ativo" : "Pausado"}
                    </ConsoleStatus>
                  </div>
                ))}
                {!agents.data?.agents.length && (
                  <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
                    Nenhum agente cadastrado. Cadastre um agente para começar a distribuir leads.
                  </p>
                )}
              </div>
            </ConsoleCard>

            <ConsoleCard pad={false} className="xl:col-span-2">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Atividade recente</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">Eventos vindos de leads, cobranças e follow-ups</p>
                </div>
                <span className="font-data text-[16px] font-bold text-[var(--text-primary)]">{activity?.length ?? 0}</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {loadingActivity && (
                  <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">Carregando eventos…</p>
                )}
                {!loadingActivity &&
                  (activity ?? []).map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                      <time className="font-data w-12 shrink-0 text-[11px] text-[var(--text-muted)]">{timeOf(item.date)}</time>
                      <ConsoleStatus tone={ACTIVITY_TONE[item.type]}>{item.type}</ConsoleStatus>
                      <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
                        {item.label}
                        {item.sub ? <span className="text-[var(--text-muted)]"> · {item.sub}</span> : null}
                      </p>
                    </div>
                  ))}
                {!loadingActivity && !activity?.length && (
                  <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
                    Nenhuma atividade recente registrada.
                  </p>
                )}
              </div>
            </ConsoleCard>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ConsoleCard className="xl:col-span-2">
            <div className="mb-4">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Funil comercial</h2>
              <p className="text-[11px] text-[var(--text-muted)]">Do lead recebido à venda fechada</p>
            </div>
            <div className="space-y-3">
              {funnel.map((item) => (
                <div key={item.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-[var(--text-secondary)]">{item.label}</span>
                    <span className="font-data text-[13px] font-bold text-[var(--text-primary)]">
                      {formatNumber(item.value)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-[999px] bg-[var(--bg-subtle)]">
                    <div
                      className="h-full rounded-[999px] bg-blue-500 transition-[width] duration-300"
                      style={{ width: `${item.value ? Math.max((item.value / funnelMax) * 100, 4) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {!funnel.length && (
                <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">
                  Sem dados de funil no período.
                </p>
              )}
            </div>
          </ConsoleCard>

          <ConsoleCard>
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={15} className="text-[var(--violet)]" />
              <div>
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Liturgia de hoje</h2>
                <p className="text-[11px] text-[var(--text-muted)]">{liturgia.data?.liturgia ?? "Evangelho do dia"}</p>
              </div>
            </div>
            {liturgia.data?.available ? (
              <>
                <p className="font-data text-[11px] font-bold text-[var(--violet)]">{liturgia.data.evangelho?.referencia}</p>
                <p className="mt-2 line-clamp-[10] text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {liturgia.data.evangelho?.texto}
                </p>
              </>
            ) : (
              <p className="py-4 text-[12px] text-[var(--text-muted)]">
                {liturgia.loading ? "Carregando liturgia do dia…" : liturgia.data?.reason ?? "Liturgia do dia indisponível."}
              </p>
            )}
          </ConsoleCard>
          </div>
        </>
      )}

      {tvMode && (
        <TvMode
          onExit={() => setTvMode(false)}
          clock={clock}
          realtime={realtime}
          attention={attention}
          liturgia={liturgia.data}
          metrics={[
            { label: "Recebido", value: metricValue(metrics.get("received_revenue"), "R$ 0,00"), tone: "emerald" },
            { label: "Em aberto", value: metricValue(metrics.get("open_collections"), "R$ 0,00"), tone: "amber" },
            { label: "Leads na base", value: metricValue(metrics.get("total_leads"), "0"), tone: "blue" },
            { label: "Leads ativos", value: metricValue(metrics.get("active_leads"), "0"), tone: "blue" },
            { label: "Agentes ativos", value: metricValue(metrics.get("agents_enabled"), "0"), tone: "violet" },
          ]}
          agenda={agenda.map((row) => ({
            id: row.id,
            domain: row.domain,
            state: row.state,
            owner: row.owner,
            nextStep: row.nextStep,
          }))}
          queues={pendingItems.map((item) => ({
            id: item.id,
            label: item.label,
            count: item.count,
            severity: item.severity,
          }))}
          agents={(agents.data?.agents ?? []).map((agent) => ({
            id: agent.id,
            name: agent.name,
            enabled: agent.enabled,
            activeLeads: agent.activeLeads,
            conversations: agent.conversations,
          }))}
          events={(activity ?? []).slice(0, 12).map((item, index) => ({
            id: `${item.id}-${index}`,
            time: timeOf(item.date),
            type: item.type,
            label: `${item.label}${item.sub ? ` · ${item.sub}` : ""}`,
          }))}
          funnel={funnel.map((step) => ({ id: step.id, label: step.label, value: step.value }))}
        />
      )}
    </ConsolePage>
  );
}
