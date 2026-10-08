import type { CoreData } from "@/lib/server/crm-data";
import type { DashboardSummaryResponse, LeadDetailResponse, PendingCenterResponse } from "@/types/api";

/**
 * Filtros de quem está preso a um segmento (ver `segmentScope` em roles.ts).
 * Funções puras sobre dados já carregados: a rota decide QUEM é escopado, aqui
 * só se corta o que ele pode ver.
 */

/** Dinheiro de cobrança e estoque: fora do escopo de instaladores. */
const SUMMARY_METRICS_FORA_DO_ESCOPO = new Set(["received_revenue", "open_collections", "produtos_disponiveis"]);

const PENDING_FORA_DO_ESCOPO = new Set(["collections_due_today"]);

/** Conversa, mensagem e cobrança não aparecem para quem é escopado. */
const TIMELINE_FORA_DO_ESCOPO = new Set(["conversation", "message", "collection"]);

export function scopeCore(core: CoreData, segments: string[]): CoreData {
  const leads = core.leads.filter((l) => l.segment != null && segments.includes(l.segment));
  const leadIds = new Set(leads.map((l) => l.id));
  const phones = new Set(leads.map((l) => l.wa_phone).filter(Boolean));
  const doLead = (row: { lead_id: string | null }) => row.lead_id != null && leadIds.has(row.lead_id);

  return {
    leads,
    // O follow-up às vezes só tem o telefone, sem lead_id.
    followups: core.followups.filter(
      (f) => doLead(f) || (f.lead_id == null && f.numero_cliente != null && phones.has(f.numero_cliente))
    ),
    conversations: core.conversations.filter(doLead),
    vendors: core.vendors.filter((v) => (v.segment ?? []).some((s) => segments.includes(s))),
    // Cobrança é dos devedores, outro segmento: nada dela entra.
    cobrancas: [],
    quotes: core.quotes.filter(doLead),
    sales: core.sales.filter(doLead),
  };
}

export function scopeSummary(summary: DashboardSummaryResponse): DashboardSummaryResponse {
  return {
    ...summary,
    metrics: summary.metrics.filter((m) => !SUMMARY_METRICS_FORA_DO_ESCOPO.has(m.id)),
    commercialIndicators: summary.commercialIndicators.filter((m) => !SUMMARY_METRICS_FORA_DO_ESCOPO.has(m.id)),
  };
}

export function scopePending(pending: PendingCenterResponse): PendingCenterResponse {
  return { ...pending, items: pending.items.filter((i) => !PENDING_FORA_DO_ESCOPO.has(i.id)) };
}

/** null = o lead é de outro segmento (a rota responde 404, não 403, para não confirmar que existe). */
export function scopeLeadDetail(detail: LeadDetailResponse, segments: string[]): LeadDetailResponse | null {
  if (detail.lead.segment == null || !segments.includes(detail.lead.segment)) return null;
  return {
    ...detail,
    summary: { ...detail.summary, conversations: 0, messages: 0, collections: 0 },
    timeline: detail.timeline.filter((item) => !TIMELINE_FORA_DO_ESCOPO.has(item.type)),
    nextAction: detail.nextAction && !TIMELINE_FORA_DO_ESCOPO.has(detail.nextAction.type) ? detail.nextAction : null,
    financialHandoff: null,
  };
}
