"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, ChevronRight, Grid2X2, Kanban, List, Phone, Search, UserRound } from "lucide-react";
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
  // aiAgent is the vendor tied to the lead's active conversation
  // (conversations.vendor_id, set by WF-07's segment-based routing) — that IS
  // the "forwarded to salesperson" moment, even when leads.owner_name (a
  // separate, later-set field) is still empty. Checking aiAgent too fixes
  // leads getting stuck in "Recebendo Follow-up" despite already having a
  // vendor attached, just because an automated followup was also queued.
  if (lead.responsible || lead.aiAgent) return "ENCAMINHADO";
  if (lead.nextActionAt) return "FOLLOWUP";
  if (lead.hasConversation) return "CONVERSANDO";
  return "NOVO";
}

function statusTone(status: string | null): "green" | "amber" | "red" | "blue" | "slate" {
  if (status === "ACTIVE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "LOST") return "red";
  return "slate";
}

export default function LeadsPage() {
  // Kanban needs horizontal scroll room a phone doesn't have — default to the
  // existing Cards view below 768px instead. Lazy initializer (not an effect)
  // so there's no flash of the wrong view before it corrects itself.
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "cards" : "kanban"
  );
  const [segment, setSegment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (segment) params.set("segment", segment);
  if (search) params.set("search", search);
  params.set("limit", "300");

  const leads = useApi<LeadsResponse>(`/api/leads?${params.toString()}`);
  const detail = useApi<LeadDetailResponse>(selectedId ? `/api/leads/${selectedId}` : null);
  const items = useMemo(() => leads.data?.items ?? [], [leads.data]);

  const segments = useMemo(() => {
    const unique = new Map<string, string>();
    for (const lead of items) {
      if (lead.segment) unique.set(lead.segment, lead.segmentLabel);
    }
    return [...unique.entries()].map(([id, label]) => ({ id, label }));
  }, [items]);

  return (
    <ConsolePage
      title="Leads"
      subtitle="Gestao de leads e oportunidades"
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ConsoleButton active={!segment} onClick={() => setSegment("")}>Todos <span className="font-data opacity-80">{items.length}</span></ConsoleButton>
          {segments.map((s) => (
            <ConsoleButton key={s.id} active={segment === s.id} onClick={() => setSegment(s.id)}>
              {s.label} <span className="font-data opacity-80">{items.filter((i) => i.segment === s.id).length}</span>
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
            {view === "kanban" && <LeadsKanban leads={items} onSelect={setSelectedId} />}
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
    </ConsolePage>
  );
}

function LeadsTable({ leads, onSelect, selectedId }: { leads: LeadListItem[]; onSelect: (id: string) => void; selectedId: string | null }) {
  return (
    <ConsoleCard pad={false}>
      <ConsoleTable headers={["Lead", "Segmento", "Status", "Responsavel", "Ultimo contato", "Proxima acao"]}>
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
            <td className="px-3 py-3 text-[var(--text-secondary)]">{lead.responsible ?? lead.aiAgent ?? "Sem responsavel"}</td>
            <td className="px-3 py-3 text-[var(--text-muted)]">{formatDateTime(lead.lastContactAt)}</td>
            <td className="px-3 py-3">
              {lead.nextActionAt ? <ConsoleStatus tone="amber">{formatDateTime(lead.nextActionAt)}</ConsoleStatus> : <span className="text-[var(--text-muted)]">-</span>}
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

function LeadsKanban({ leads, onSelect }: { leads: LeadListItem[]; onSelect: (id: string) => void }) {
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
                  className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-inset)] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-blue-500/60"
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
                      <CalendarDays size={11} /> Ultimo contato: {formatDateTime(lead.lastContactAt)}
                    </div>
                    {lead.nextActionAt && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={11} /> Follow-up: {formatDateTime(lead.nextActionAt)}
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
        <Info icon={UserRound} label="Responsavel" value={detail.lead.responsible ?? detail.lead.aiAgent ?? "-"} />
        <Info icon={Search} label="Origem" value={detail.lead.origin ?? "-"} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="Conversas" value={detail.summary.conversations} />
        <MiniStat label="Follow-ups" value={detail.summary.followups} />
        <MiniStat label="Imagens" value={detail.summary.generatedImages} />
      </div>

      <div className="mt-5">
        <h3 className="mb-3 text-[12px] font-bold text-[var(--text-primary)]">Historico recente</h3>
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
