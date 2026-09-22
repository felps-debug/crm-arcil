"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  DollarSign,
  MessagesSquare,
  PackageCheck,
  RefreshCw,
  Tv,
} from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsoleMetric,
  ConsolePage,
  ConsoleStaleBadge,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { fetchJson, formatMoney, formatNumber, useApi } from "@/lib/client-api";
import { cacheKey, getView, mutate } from "@/lib/api-cache";
import { navigationPath, navigationTtfb, startJourney } from "@/lib/perf/trace-client";
import { createSectionBatcher } from "@/lib/realtime-sections";
import { createClient } from "@/lib/supabase/client";
import { useUrgentFollowups } from "@/hooks/use-urgent-followups";
import type {
  ApiMetric,
  DashboardSnapshotResponse,
  DashboardSummaryResponse,
  PendingSeverity,
  SectionResult,
} from "@/types/api";
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

const SNAPSHOT_URL = "/api/dashboard/snapshot";

type SectionView<T> = { data: T | null; loading: boolean; error: string | null; forbidden: boolean };

/** Uma seção do snapshot no formato que os blocos da tela já consumiam. */
function sectionState<T>(
  section: SectionResult<T> | undefined,
  request: { loading: boolean; error: string | null }
): SectionView<T> {
  if (section?.status === "ok") return { data: section.data, loading: false, error: null, forbidden: false };
  if (section?.status === "forbidden") return { data: null, loading: false, error: null, forbidden: true };
  if (section?.status === "error") return { data: null, loading: false, error: section.message, forbidden: false };
  return { data: null, loading: request.loading, error: request.error, forbidden: false };
}

function timeOf(date: string | null) {
  return date ? new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function DashboardPage() {
  const [realtime, setRealtime] = useState<"connecting" | "live" | "paused">("connecting");
  const [tvMode, setTvMode] = useState(false);

  // Uma request para a tela inteira: /api/dashboard/snapshot verifica o usuário
  // uma vez e lê cada tabela uma vez. Antes eram quatro rotas, cada uma com a
  // própria autenticação e as mesmas sete varreduras, mais três consultas do
  // browser para atividade e follow-ups urgentes.
  //
  // A jornada (lib/perf) começa aqui: fria se não havia nada em cache desta
  // tela, quente se é uma volta. O traceId vai no header e o servidor grava
  // as etapas dele com o mesmo id.
  const [journey] = useState(() =>
    startJourney("dashboard", getView(cacheKey(SNAPSHOT_URL)).data ? "warm" : "cold")
  );
  // Aba aberta direto no dashboard: conta desde o início da navegação
  // (performance.now() é relativo a ela), com o primeiro byte junto. Chegada
  // por clique dentro do app: conta desde a montagem, que é quando clicou.
  const [openedHere] = useState(() => navigationPath() === "/" && !getView(cacheKey(SNAPSHOT_URL)).data);
  const [mountedAt] = useState(() => (openedHere ? 0 : performance.now()));
  const snapshot = useApi<DashboardSnapshotResponse>(SNAPSHOT_URL, { headers: { "x-trace-id": journey.traceId } });
  const { revalidate } = snapshot;

  useEffect(() => {
    const supabase = createClient();
    let lastApplied = 0;
    let flushSeq = 0;

    // O realtime emite um evento por LINHA, e um disparo de cobrança grava
    // dezenas de uma vez. O batcher junta tudo que chega em 2s e pede de volta
    // só as seções que dependem das tabelas que mudaram — uma conversa nova
    // não recarrega pendências nem estoque.
    const batcher = createSectionBatcher(async (secoes) => {
      const seq = ++flushSeq;
      try {
        const partial = await fetchJson<DashboardSnapshotResponse>(`${SNAPSHOT_URL}?sections=${secoes.join(",")}`);
        // Um flush lento não pode apagar o que um flush mais novo já trouxe.
        if (seq < lastApplied) return;
        lastApplied = seq;
        mutate<DashboardSnapshotResponse>(SNAPSHOT_URL, (atual) => ({
          ...partial,
          sections: { ...atual?.sections, ...partial.sections },
        }));
      } catch {
        // Falhou a atualização parcial: refaz a tela inteira em segundo plano.
        revalidate();
      }
    });

    const onChange = (table: string) => () => batcher.add(table);
    const channel = supabase
      .channel("operacao-agora-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, onChange("leads"))
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, onChange("followups"))
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, onChange("cobranca_log"))
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, onChange("conversations"))
      // Sem refletir o status da inscrição, o selo dizia "ao vivo" mesmo com o
      // canal derrubado — o pior estado possível num painel de operação.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime("paused");
      });
    return () => {
      batcher.dispose();
      supabase.removeChannel(channel);
    };
    // revalidate muda de identidade a cada render; o canal não pode ser refeito por isso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = revalidate;
  const sections = snapshot.data?.sections;
  const summary = sectionState(sections?.summary, snapshot);
  const pending = sectionState(sections?.pending, snapshot);
  const agents = sectionState(sections?.agents, snapshot);
  const inventory = sectionState(sections?.inventory, snapshot);
  const activityState = sectionState(sections?.activity, snapshot);
  const activity = activityState.data;
  const loadingActivity = activityState.loading;
  // Um número de follow-ups urgentes por sessão: o do snapshot abastece o
  // contexto, que a sidebar também lê — em vez de cada um buscar o seu.
  const { count: urgentFollowups, setFromSnapshot } = useUrgentFollowups();
  const snapshotUrgent = sections?.urgentFollowups?.status === "ok" ? sections.urgentFollowups.data.count : null;
  useEffect(() => {
    if (snapshotUrgent !== null) setFromSnapshot(snapshotUrgent);
  }, [snapshotUrgent, setFromSnapshot]);

  const metrics = useMemo(
    () => new Map((summary.data?.metrics ?? []).map((metric) => [metric.id, metric])),
    [summary.data]
  );

  const pendingItems = useMemo(() => pending.data?.items ?? [], [pending.data]);
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
        // Sem manage_estoque a seção nem é carregada. Antes a rota respondia 403
        // e a linha dizia "ERP sem quantidade" — um estado do ERP que não era verdade.
        state: inventory.forbidden
          ? "Sem acesso"
          : inventory.data?.estoqueSincronizado
            ? `${metricValue(stockMetric, "0")} produtos`
            : "ERP sem quantidade",
        owner: "ERP",
        lastSignal: inventory.forbidden
          ? "Requer permissão de estoque"
          : inventory.data?.estoqueSincronizado
            ? "Saldo sincronizado"
            : "Aguardando saldo do ERP",
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
  }, [activity, agents.data?.agents, inventory.data, inventory.forbidden, metrics, pendingItems, summary.data?.breakdowns.leadsByStatus, urgentFollowups]);

  // Skeleton só enquanto não existe nada para mostrar; uma atualização com
  // dados na tela não apaga a tela.
  const loading = snapshot.isInitialLoading;
  // "Utilizável" = resumo e pendências resolvidos (com dado ou com erro). É o
  // marcador que a medição de aceite (e2e/perf) espera.
  const ready = Boolean(sections?.summary && sections?.pending);

  // Tela pronta: registra quanto levou e manda para performance_traces.
  useEffect(() => {
    if (!ready) return;
    if (openedHere) {
      const ttfb = navigationTtfb();
      if (ttfb !== null) journey.mark("ttfb", ttfb);
    }
    journey.mark("ready", performance.now() - mountedAt);
    journey.flush();
  }, [ready, journey, mountedAt, openedHere]);

  return (
    <ConsolePage
      title="Dashboard"
      subtitle="Visão central da operação"
      actions={
        <>
          <ConsoleStaleBadge show={snapshot.isStale} onRetry={snapshot.revalidate} />
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
      <div data-dashboard-ready={ready ? "true" : "false"} hidden />
      {loading && <div data-skeleton="full"><ConsoleLoading /></div>}
      {!loading && !sections && snapshot.error && <ConsoleError message={snapshot.error} />}
      {summary.error && <ConsoleError message={summary.error} />}

      {!loading && sections && (
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
            {/* "Total leads" e "Agentes habilitados" saíram daqui. O primeiro
                mostrava dígito único (8 leads) enquanto a operação real tem
                milhares de conversas no Chatwoot — o painel parecia uma empresa
                parada. O segundo é a contagem de vendedores: muda uma vez por
                mês e ocupava um dos seis lugares mais visíveis de uma tela que
                se olha todo dia. */}
            <ConsoleMetric
              label="Atendimentos do agente"
              value={metricValue(metrics.get("agent_conversations"), "—")}
              helper="passaram pelo agente de IA"
              icon={MessagesSquare}
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
              label="Disponível para venda"
              value={metricValue(metrics.get("produtos_disponiveis"), "0")}
              helper="produtos com saldo"
              icon={PackageCheck}
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
              helper="boletos não pagos"
              icon={DollarSign}
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
                {pending.error && <div className="p-3"><ConsoleError message={pending.error} /></div>}
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
                {!pendingItems.length && !pending.error && (
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
                {agents.error && <div className="p-3"><ConsoleError message={agents.error} /></div>}
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
                {!agents.data?.agents.length && !agents.error && (
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
                {activityState.error && <div className="p-3"><ConsoleError message={activityState.error} /></div>}
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
                {!loadingActivity && !activity?.length && !activityState.error && (
                  <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
                    Nenhuma atividade recente registrada.
                  </p>
                )}
              </div>
            </ConsoleCard>
          </div>

          <ConsoleCard>
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
        </>
      )}

      {tvMode && (
        <TvMode
          onExit={() => setTvMode(false)}
          clock={clock}
          realtime={realtime}
          attention={attention}
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
