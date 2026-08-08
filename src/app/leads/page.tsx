"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, CalendarDays, ChevronRight, Grid2X2, Kanban, List, Phone, Search, UserRound, X } from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { formatDateTime, useApi } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { LeadDetailResponse, LeadListItem, LeadsResponse } from "@/types/api";

type ViewMode = "table" | "kanban" | "cards";

type KanbanStageId = "NOVO" | "CONVERSANDO" | "FOLLOWUP" | "ENCAMINHADO" | "PERDIDO";

const PIPELINE: { id: KanbanStageId; label: string; tone: "green" | "amber" | "red" }[] = [
  { id: "NOVO", label: "Novo Lead", tone: "amber" },
  { id: "CONVERSANDO", label: "Conversando", tone: "green" },
  { id: "FOLLOWUP", label: "Recebendo Follow-up", tone: "amber" },
  { id: "ENCAMINHADO", label: "Encaminhado ao Vendedor", tone: "green" },
  { id: "PERDIDO", label: "Perdido", tone: "red" },
];

function kanbanStage(lead: LeadListItem): KanbanStageId {
  if (lead.status === "LOST") return "PERDIDO";
  // handoffSentAt é o sinal real: a mensagem saiu para o WhatsApp do vendedor.
  // NÃO usar aiAgent aqui — ele mapeia conversations.vendor_id, que o n8n
  // carimba na abertura da conversa, e tratar isso como handoff marcava todo
  // lead com conversa como já encaminhado.
  if (lead.handoffSentAt || lead.responsible) return "ENCAMINHADO";
  // awaitingFollowup, not nextActionAt: a followups row is created together
  // with the lead, so "has a followup row" ≠ "a followup was sent".
  if (lead.awaitingFollowup) return "FOLLOWUP";
  if (lead.hasConversation) return "CONVERSANDO";
  return "NOVO";
}

/** Only owner_name is a human owner. The vendor bound to the conversation is
 * the automated routing target, so label it as such instead of passing it off
 * as the responsible salesperson. */
function responsibleLabel(lead: LeadListItem): string {
  if (lead.handoffVendor) return lead.handoffVendor;
  if (lead.responsible) return lead.responsible;
  if (lead.aiAgent) return `Fila IA · ${lead.aiAgent}`;
  return "Sem responsavel";
}

/** Enviado sem aceite é o estado que precisa saltar aos olhos: o lead parece
 * atendido e ninguém pegou. */
/** Os filtros que o dashboard manda nos drilldowns, além de segment/status/search.
 *  Vão direto para a API, que sabe resolver cada um. */
const FILTROS_DA_URL = ["unassigned", "withoutFollowup", "handoff", "period", "late", "respondeu", "hasQuotes", "hasSales"] as const;

const ROTULO_DO_FILTRO: Record<string, string> = {
  unassigned: "sem responsável",
  withoutFollowup: "sem follow-up",
  handoff: "encaminhado sem aceite",
  period: "últimos 30 dias",
  late: "follow-up atrasado",
  respondeu: "respondeu o follow-up",
  hasQuotes: "com orçamento",
  hasSales: "com venda",
};

function handoffState(lead: LeadListItem): { label: string; tone: "green" | "red" } | null {
  if (!lead.handoffSentAt) return null;
  if (lead.handoffAcceptedAt) return { label: "Assumido", tone: "green" };
  return { label: "Aguardando aceite", tone: "red" };
}

function statusTone(status: string | null): "green" | "amber" | "red" | "blue" | "slate" {
  if (status === "ACTIVE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "LOST") return "red";
  return "slate";
}

export default function LeadsPage() {
  // useSearchParams exige um limite de Suspense para o App Router conseguir
  // renderizar o shell antes de conhecer a query string.
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <LeadsBoard />
    </Suspense>
  );
}

function LeadsBoard() {
  // O dashboard linka para cá já filtrado (ex.: /leads?status=ACTIVE vindo do
  // card "Leads ativos"). Sem ler a query aqui, aqueles links caíam numa lista
  // sem filtro nenhum e o drilldown era decorativo.
  const searchParams = useSearchParams();
  const urlSegment = searchParams.get("segment") ?? "";
  const urlStatus = searchParams.get("status") ?? "";
  const urlSearch = searchParams.get("search") ?? "";

  // Kanban needs horizontal scroll room a phone doesn't have — default to the
  // existing Cards view below 768px instead. Lazy initializer (not an effect)
  // so there's no flash of the wrong view before it corrects itself.
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "cards" : "kanban"
  );
  const [segment, setSegment] = useState(urlSegment);
  const [search, setSearch] = useState(urlSearch);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Navegar de novo pelo dashboard (mesma rota, query diferente) não remonta o
  // componente, então o estado tem que acompanhar a URL. Ajuste durante o render
  // em vez de useEffect: o efeito renderizaria uma vez com o filtro antigo.
  const queryKey = JSON.stringify([urlSegment, urlSearch]);
  const [syncedQuery, setSyncedQuery] = useState(queryKey);
  if (syncedQuery !== queryKey) {
    setSyncedQuery(queryKey);
    setSegment(urlSegment);
    setSearch(urlSearch);
  }

  // Bump on any leads/followups change so the board (and the open lead's
  // detail panel) update live instead of only on a manual refresh — same
  // postgres_changes pattern used in / and /cobranca.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => setRefreshTick((t) => t + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, () => setRefreshTick((t) => t + 1))
      // conversations drives CONVERSANDO and the "Fila IA" label, and it's the
      // table n8n writes when a session opens — without it the board goes stale
      // exactly when a lead starts talking.
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => setRefreshTick((t) => t + 1))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // O segmento é filtrado no cliente de propósito: mandando-o para a API a lista
  // volta só com aquele segmento, e as abas — que são derivadas da lista — se
  // apagavam sozinhas assim que você clicava numa delas.
  const params = new URLSearchParams();
  if (urlStatus) params.set("status", urlStatus);
  if (search) params.set("search", search);
  // O dashboard manda oito filtros nos drilldowns e a página lia só três. Clicar
  // em "Handoff sem aceite" abria a lista inteira, sem marcar quais eram os
  // encaminhados sem aceite — o card dizia um número e a tela mostrava outro.
  for (const chave of FILTROS_DA_URL) {
    const valor = searchParams.get(chave);
    if (valor) params.set(chave, valor);
  }
  params.set("limit", "300");
  if (refreshTick) params.set("_r", String(refreshTick));

  const filtrosAtivos = FILTROS_DA_URL.filter((chave) => searchParams.get(chave)).map((chave) => ({
    chave,
    rotulo: ROTULO_DO_FILTRO[chave] ?? chave,
  }));

  const leads = useApi<LeadsResponse>(`/api/leads?${params.toString()}`);
  const detail = useApi<LeadDetailResponse>(
    selectedId ? `/api/leads/${selectedId}${refreshTick ? `?_r=${refreshTick}` : ""}` : null
  );
  const allItems = useMemo(() => leads.data?.items ?? [], [leads.data]);
  const items = useMemo(
    () => (segment ? allItems.filter((l) => l.segment === segment) : allItems),
    [allItems, segment]
  );

  const segments = useMemo(() => {
    const unique = new Map<string, string>();
    for (const lead of allItems) {
      if (lead.segment) unique.set(lead.segment, lead.segmentLabel);
    }
    return [...unique.entries()].map(([id, label]) => ({ id, label }));
  }, [allItems]);

  return (
    <ConsolePage
      title="Leads"
      subtitle="Gestão de leads e oportunidades"
      actions={
        <ConsoleInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lead..."
          aria-label="Buscar lead"
          className="w-full sm:w-64"
        />
      }
    >
      {/* Sem isto o usuário chega pelo dashboard numa lista filtrada e não tem
          como saber por quê, nem como voltar para a lista inteira. */}
      {(urlStatus || filtrosAtivos.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span>Filtrado por</span>
          {urlStatus && <ConsoleStatus tone={statusTone(urlStatus)}>{urlStatus}</ConsoleStatus>}
          {filtrosAtivos.map((f) => (
            <ConsoleStatus key={f.chave} tone="blue">{f.rotulo}</ConsoleStatus>
          ))}
          <Link href="/leads" className="inline-flex items-center gap-1 font-semibold text-blue-300 hover:underline">
            <X size={12} /> limpar
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ConsoleButton active={!segment} onClick={() => setSegment("")}>Todos <span className="font-data opacity-80">{allItems.length}</span></ConsoleButton>
          {segments.map((s) => (
            <ConsoleButton key={s.id} active={segment === s.id} onClick={() => setSegment(s.id)}>
              {s.label} <span className="font-data opacity-80">{allItems.filter((i) => i.segment === s.id).length}</span>
            </ConsoleButton>
          ))}
        </div>
        <div className="flex gap-2">
          <ConsoleButton icon={Grid2X2} active={view === "cards"} onClick={() => setView("cards")}>Cards</ConsoleButton>
          <ConsoleButton icon={List} active={view === "table"} onClick={() => setView("table")}>Tabela</ConsoleButton>
          <ConsoleButton icon={Kanban} active={view === "kanban"} onClick={() => setView("kanban")} className="hidden md:inline-flex">Kanban</ConsoleButton>
        </div>
      </div>

      {leads.loading && <ConsoleLoading />}
      {leads.error && <ConsoleError message={leads.error} />}

      {!leads.loading && !leads.error && (
        <div className={view === "kanban" ? "block" : "grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]"}>
          <div className="min-w-0">
            {view === "table" && <LeadsTable leads={items} onSelect={setSelectedId} selectedId={selectedId} />}
            {view === "kanban" && <LeadsKanban leads={items} onSelect={setSelectedId} selectedId={selectedId} />}
            {view === "cards" && <LeadsCards leads={items} onSelect={setSelectedId} />}
          </div>
          {view !== "kanban" && (
            <LeadPanel
              loading={detail.loading && !!selectedId}
              detail={selectedId ? detail.data : null}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      {/* O kanban ocupa a largura toda e rola na horizontal, então não cabe a
          coluna lateral de 380px que os outros modos usam. Antes disso o painel
          simplesmente não era renderizado no kanban: clicar num card marcava o
          lead, buscava o detalhe e não mostrava nada. Aqui ele vira gaveta. */}
      {view === "kanban" && selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Prontuário do lead">
          <button
            type="button"
            aria-label="Fechar prontuário"
            className="flex-1 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setSelectedId(null)}
          />
          <div className="w-full max-w-[400px] overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-base)] p-4 shadow-2xl">
            <LeadPanel
              loading={detail.loading}
              detail={detail.data}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}
    </ConsolePage>
  );
}

function LeadsTable({ leads, onSelect, selectedId }: { leads: LeadListItem[]; onSelect: (id: string) => void; selectedId: string | null }) {
  return (
    <ConsoleCard pad={false}>
      <ConsoleTable headers={["Lead", "Segmento", "Status", "Responsável", "Último contato", "Aguardando desde"]}>
        {leads.map((lead) => (
          <tr
            key={lead.id}
            onClick={() => onSelect(lead.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(lead.id);
              }
            }}
            role="button"
            tabIndex={0}
            className={`cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-blue-500/5 focus-visible:bg-blue-500/10 ${selectedId === lead.id ? "bg-blue-500/10" : ""}`}
          >
            <td className="px-3 py-3">
              <div className="font-semibold text-[var(--text-primary)]">{lead.name ?? "Sem nome"}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <Phone size={11} /> {lead.phone ?? "-"}
              </div>
            </td>
            <td className="px-3 py-3"><ConsoleStatus tone="slate">{lead.segmentLabel}</ConsoleStatus></td>
            <td className="px-3 py-3"><ConsoleStatus tone={statusTone(lead.status)}>{lead.statusLabel}</ConsoleStatus></td>
            <td className="px-3 py-3 text-[var(--text-secondary)]">
              {responsibleLabel(lead)}
              {handoffState(lead) && (
                <div className="mt-1">
                  <ConsoleStatus tone={handoffState(lead)!.tone}>{handoffState(lead)!.label}</ConsoleStatus>
                </div>
              )}
            </td>
            <td className="px-3 py-3 text-[var(--text-muted)]">{formatDateTime(lead.lastContactAt)}</td>
            <td className="px-3 py-3">
              {lead.awaitingSince ? <ConsoleStatus tone="amber">{formatDateTime(lead.awaitingSince)}</ConsoleStatus> : <span className="text-[var(--text-muted)]">-</span>}
            </td>
          </tr>
        ))}
      </ConsoleTable>
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
        <span>Exibindo {leads.length} leads</span>
        {leads.length >= 300 && <span className="font-data text-amber-400">Limite de 300 atingido — refine a busca</span>}
      </div>
    </ConsoleCard>
  );
}

function LeadsKanban({
  leads,
  onSelect,
  selectedId,
}: {
  leads: LeadListItem[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <div className="-mx-1 flex min-h-[650px] gap-4 overflow-x-auto pb-4">
      {PIPELINE.map((stage) => {
        const stageLeads = leads.filter((l) => kanbanStage(l) === stage.id);
        return (
          <ConsoleCard key={stage.id} className="min-h-[620px] w-[284px] shrink-0 p-3">
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--text-primary)]">{stage.label}</h2>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--bg-inset)] px-1.5 font-data text-[10px] text-blue-300">
                {stageLeads.length}
              </span>
            </div>
            <div className="space-y-3">
              {stageLeads.length === 0 && (
                <p className="px-1 py-6 text-center text-[11px] text-[var(--text-muted)]">Nenhum lead neste estado</p>
              )}
              {stageLeads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => onSelect(lead.id)}
                  className={`w-full rounded-[10px] border bg-[var(--bg-inset)] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-blue-500/60 ${
                    selectedId === lead.id ? "border-blue-500" : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold text-[var(--text-primary)]">{lead.name ?? "Sem nome"}</p>
                      <ConsoleStatus tone={lead.segment === "INSTALLER" ? "green" : lead.segment === "RESELLER" ? "violet" : "slate"}>
                        {lead.segmentLabel}
                      </ConsoleStatus>
                    </div>
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">IA</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <Phone size={11} /> {lead.phone ?? "-"}
                  </div>
                  <div className="mt-3 space-y-1.5 text-[10px] text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={11} /> Último contato: {formatDateTime(lead.lastContactAt)}
                    </div>
                    {lead.awaitingSince && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={11} /> Follow-up sem resposta desde {formatDateTime(lead.awaitingSince)}
                      </div>
                    )}
                    {lead.handoffSentAt && (
                      <div className="flex items-center gap-1.5">
                        <UserRound size={11} />
                        {lead.handoffAcceptedAt
                          ? `${lead.handoffVendor ?? "Vendedor"} assumiu em ${formatDateTime(lead.handoffAcceptedAt)}`
                          : `Enviado a ${lead.handoffVendor ?? "vendedor"} em ${formatDateTime(lead.handoffSentAt)} — sem aceite`}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ConsoleCard>
        );
      })}
    </div>
  );
}

function inactivityPill(lastContactAt: string | null | undefined) {
  if (!lastContactAt) return null;
  const days = Math.floor((Date.now() - new Date(lastContactAt).getTime()) / 86_400_000);
  if (days < 7) return null;
  const label = days >= 30 ? `${Math.floor(days / 30)}m` : `${days}d`;
  const tone = days >= 30 ? "text-red-400 border-red-500/20 bg-red-500/8" : "text-amber-400 border-amber-500/20 bg-amber-500/8";
  return { label, tone, days };
}

function LeadsCards({ leads, onSelect }: { leads: LeadListItem[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {leads.map((lead) => {
        const inactive = inactivityPill(lead.lastContactAt);
        return (
          <button key={lead.id} onClick={() => onSelect(lead.id)} className="text-left">
            <ConsoleCard className="transition-colors hover:border-blue-500/50">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-blue-500/10 text-blue-300">
                  <UserRound size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-[14px] font-bold text-[var(--text-primary)]">{lead.name ?? "Sem nome"}</h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {inactive && (
                        <span
                          title={`Sem atividade há ${inactive.days} dias`}
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${inactive.tone}`}
                        >
                          {inactive.label}
                        </span>
                      )}
                      <ConsoleStatus tone={statusTone(lead.status)}>{lead.statusLabel}</ConsoleStatus>
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">{lead.phone ?? "-"}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <Info icon={Building2} label="Empresa" value={lead.company ?? "-"} />
                    <Info icon={Search} label="Origem" value={lead.origin ?? "-"} />
                  </div>
                </div>
              </div>
            </ConsoleCard>
          </button>
        );
      })}
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-[var(--bg-inset)] p-2">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--text-muted)]">
        <Icon size={10} /> {label}
      </div>
      <p className="mt-1 truncate font-semibold text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}

function LeadPanel({
  detail,
  loading,
  onClose,
}: {
  detail: LeadDetailResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (loading) return <ConsoleLoading />;
  if (!detail) {
    return (
      <ConsoleCard className="hidden min-h-[520px] xl:block">
        <div className="flex h-full items-center justify-center text-center text-[13px] font-semibold text-[var(--text-muted)]">
          Selecione um lead para abrir o prontuario comercial.
        </div>
      </ConsoleCard>
    );
  }

  return (
    <ConsoleCard className="min-h-[520px]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">{detail.lead.name ?? "Sem nome"}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{detail.lead.company ?? detail.lead.phone ?? "-"}</p>
        </div>
        <ConsoleButton onClick={onClose} aria-label="Fechar prontuario">
          <ChevronRight size={14} />
        </ConsoleButton>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Info icon={Phone} label="Contato" value={detail.lead.phone ?? "-"} />
        <Info icon={Building2} label="Empresa" value={detail.lead.company ?? "-"} />
        <Info icon={UserRound} label="Responsavel" value={responsibleLabel(detail.lead)} />
        <Info icon={Search} label="Origem" value={detail.lead.origin ?? "-"} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="Conversas" value={detail.summary.conversations} />
        <MiniStat label="Follow-ups" value={detail.summary.followups} />
        <MiniStat label="Imagens" value={detail.summary.generatedImages} />
      </div>

      <div className="mt-5">
        <h3 className="mb-3 text-[12px] font-bold text-[var(--text-primary)]">Histórico recente</h3>
        <div className="space-y-2">
          {detail.timeline.slice(0, 6).map((item) => (
            <div key={`${item.type}-${item.id}`} className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-bold text-[var(--text-primary)]">{item.title}</p>
                <span className="text-[10px] text-[var(--text-muted)]">{formatDateTime(item.occurredAt)}</span>
              </div>
              {item.description && <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-muted)]">{item.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </ConsoleCard>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] p-2">
      <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-data text-[18px] font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
