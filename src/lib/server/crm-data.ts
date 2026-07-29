import { createAdminClient } from "@/lib/supabase/admin";
import { allTimePeriod, countBy, defaultPeriod, isOlderThan, metric, percent } from "@/lib/server/crm-metrics";
import { labelSegment, labelStatus } from "@/lib/server/crm-labels";
import type {
  ActivityLogResponse,
  AgentConversationsResponse,
  AgentSummaryItem,
  AgentSummaryResponse,
  DashboardSummaryResponse,
  InventoryProduct,
  InventorySummaryResponse,
  LeadDetailResponse,
  LeadListItem,
  LeadsResponse,
  LeadTimelineItem,
  PendingCenterResponse,
} from "@/types/api";

type LeadRow = {
  id: string;
  wa_phone: string | null;
  name: string | null;
  company: string | null;
  region: string | null;
  channel_origin: string | null;
  segment: string | null;
  status: string | null;
  lead_score: number | null;
  created_at: string | null;
  updated_at: string | null;
  owner_name?: string | null;
  city?: string | null;
  origem?: string | null;
};

type FollowupRow = {
  id: number;
  lead_id: string | null;
  nome_cliente: string | null;
  numero_cliente: string | null;
  tipo: string | null;
  status: string | null;
  respondeu: boolean | null;
  followup_sent: boolean | null;
  created_at: string | null;
  ultima_msg_ia: string | null;
  ultima_msg_lead: string | null;
};

type ConversationRow = {
  id: string;
  lead_id: string | null;
  channel: string | null;
  intent: string | null;
  status: string | null;
  vendor_id: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string | null;
  role: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type VendorRow = {
  id: string;
  name: string | null;
  segment: string[] | null;
  wa_phone: string | null;
  active: boolean | null;
  created_at: string | null;
};

type CobrancaRow = {
  id: string;
  telefone: string | null;
  nome: string | null;
  valor: string | null;
  vencimento: string | null;
  status_disparo: string | null;
  respondeu: boolean | null;
  pagamento_confirmado: boolean | null;
  data_disparo: string | null;
  created_at: string | null;
};

type SheetSourceRow = {
  id: string;
  vendedor_id: string | null;
  cidade: string | null;
  estado: string | null;
  last_synced_at: string | null;
  created_at: string | null;
};

type GeneratedImageRow = {
  id: string;
  phone_number: string | null;
  storage_url: string | null;
  url_imagem_final: string | null;
  agent_type: string | null;
  created_at: string | null;
  image_description: string | null;
};

type QuoteRow = {
  id: string;
  lead_id: string | null;
  price_offered: number | null;
  status: string | null;
  created_at: string | null;
};

type SaleRow = {
  id: string;
  lead_id: string | null;
  vendor_id: string | null;
  final_price: number | null;
  status: string | null;
  confirmed_at: string | null;
};

type ProductRow = {
  id: string;
  codigo_erp: string | null;
  nome: string | null;
  marca?: string | null;
  categoria?: string | null;
  btu?: string | null;
  voltagem?: string | null;
  preco_venda?: number | null;
  estoque?: number | null;
};

type LeadFilters = {
  segment?: string | null;
  status?: string | null;
  city?: string | null;
  origin?: string | null;
  responsible?: string | null;
  search?: string | null;
  unassigned?: string | null;
  withoutFollowup?: string | null;
  limit?: string | null;
};

const LEAD_SELECT = "id,wa_phone,name,company,region,channel_origin,segment,status,lead_score,created_at,updated_at,owner_name,city,origem";

function nowIso() {
  return new Date().toISOString();
}

function previousWindow() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previousFrom = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to, previousFrom };
}

function inRange(date: string | null, from: Date, to: Date) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function mapLead(lead: LeadRow, vendors: Map<string, VendorRow>, conversations: ConversationRow[], followups: FollowupRow[]): LeadListItem {
  const leadConversations = conversations.filter((c) => c.lead_id === lead.id);
  const lastConversation = leadConversations
    .filter((c) => c.started_at)
    .sort((a, b) => new Date(b.started_at!).getTime() - new Date(a.started_at!).getTime())[0];
  const aiAgent = lastConversation?.vendor_id ? vendors.get(lastConversation.vendor_id)?.name ?? null : null;
  const leadFollowups = followups.filter((f) => f.lead_id === lead.id);
  const nextFollowup = leadFollowups
    .filter((f) => !f.respondeu && f.created_at)
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())[0];

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.wa_phone,
    company: lead.company,
    city: lead.city ?? lead.region,
    segment: lead.segment,
    segmentLabel: labelSegment(lead.segment),
    status: lead.status,
    statusLabel: labelStatus(lead.status),
    origin: lead.origem ?? lead.channel_origin,
    responsible: lead.owner_name ?? null,
    aiAgent,
    hasConversation: leadConversations.length > 0,
    leadScore: lead.lead_score,
    lastContactAt: lastConversation?.started_at ?? lead.updated_at,
    nextActionAt: nextFollowup?.created_at ?? null,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchCore() {
  const supabase = createAdminClient();
  const [leadsRes, followupsRes, conversationsRes, vendorsRes, cobrancaRes, quotesRes, salesRes] = await Promise.all([
    supabase.from("leads").select(LEAD_SELECT).order("created_at", { ascending: false }),
    supabase.from("followups").select("*").order("created_at", { ascending: false }),
    supabase.from("conversations").select("*").order("started_at", { ascending: false }),
    supabase.from("vendors").select("*").order("created_at", { ascending: true }),
    supabase.from("cobranca_log").select("*").order("created_at", { ascending: false }),
    supabase.from("quotes").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("confirmed_at", { ascending: false }),
  ]);

  for (const res of [leadsRes, followupsRes, conversationsRes, vendorsRes, cobrancaRes, quotesRes, salesRes]) {
    if (res.error) throw res.error;
  }

  return {
    leads: (leadsRes.data ?? []) as LeadRow[],
    followups: (followupsRes.data ?? []) as FollowupRow[],
    conversations: (conversationsRes.data ?? []) as ConversationRow[],
    vendors: (vendorsRes.data ?? []) as VendorRow[],
    cobrancas: (cobrancaRes.data ?? []) as CobrancaRow[],
    quotes: (quotesRes.data ?? []) as QuoteRow[],
    sales: (salesRes.data ?? []) as SaleRow[],
  };
}

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const { leads, followups, vendors, quotes, sales } = await fetchCore();
  const { from, to, previousFrom } = previousWindow();
  const sentFollowups = followups.filter((f) => f.followup_sent);
  const answeredFollowups = sentFollowups.filter((f) => f.respondeu);
  const closedSales = sales.filter((s) => s.status === "CLOSED" || s.status === "CONFIRMED" || s.confirmed_at);
  const potentialRevenue = quotes.reduce((sum, q) => sum + (q.price_offered ?? 0), 0);
  const closedRevenue = closedSales.reduce((sum, s) => sum + (s.final_price ?? 0), 0);
  const period = defaultPeriod();

  const currentLeads = leads.filter((l) => inRange(l.created_at, from, to)).length;
  const previousLeads = leads.filter((l) => inRange(l.created_at, previousFrom, from)).length;
  const previousFollowups = sentFollowups.filter((f) => inRange(f.created_at, previousFrom, from)).length;

  return {
    generatedAt: nowIso(),
    period,
    metrics: [
      metric({
        id: "total_leads",
        label: "Total leads",
        value: leads.length,
        formula: "count(leads)",
        period: allTimePeriod(),
        previous: previousLeads,
        tooltip: "Todos os leads existentes na tabela leads, sem filtrar por status.",
        drilldown: { href: "/leads", filters: {} },
      }),
      metric({
        id: "active_leads",
        label: "Leads ativos",
        value: leads.filter((l) => l.status === "ACTIVE").length,
        formula: "count(leads where status = ACTIVE)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Leads cujo status atual esta marcado como ACTIVE.",
        drilldown: { href: "/leads", filters: { status: "ACTIVE" } },
      }),
      metric({
        id: "potential_revenue",
        label: "Receita potencial",
        value: potentialRevenue,
        unit: "BRL",
        formula: "sum(quotes.price_offered)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Soma dos valores ofertados em orcamentos registrados.",
        drilldown: { href: "/leads", filters: { hasQuotes: "true" } },
      }),
      metric({
        id: "followup_response_rate",
        label: "Taxa de resposta",
        value: percent(answeredFollowups.length, sentFollowups.length),
        unit: "%",
        formula: `${answeredFollowups.length} respostas / ${sentFollowups.length} follow-ups enviados`,
        period: allTimePeriod(),
        previous: previousFollowups,
        tooltip: "Percentual de follow-ups enviados que tiveram respondeu=true.",
        drilldown: { href: "/leads", filters: { view: "followups", respondeu: "true" } },
      }),
      metric({
        id: "agents_enabled",
        label: "Agentes habilitados",
        value: vendors.filter((v) => v.active).length,
        formula: "count(vendors where active = true)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Agentes cadastrados como ativos. Nao significa online em tempo real.",
        drilldown: { href: "/agentes", filters: { active: "true" } },
      }),
    ],
    commercialFunnel: [
      { id: "received", label: "Recebidos", value: leads.length },
      { id: "answered", label: "Respondidos", value: answeredFollowups.length },
      { id: "qualified", label: "Qualificados", value: leads.filter((l) => l.status === "IN_PROGRESS").length },
      { id: "quoted", label: "Orcamento enviado", value: quotes.length },
      { id: "closed", label: "Fechados", value: closedSales.length },
    ],
    commercialIndicators: [
      metric({
        id: "new_leads_30d",
        label: "Novos leads",
        value: currentLeads,
        formula: "count(leads created in current period)",
        period,
        previous: previousLeads,
        tooltip: "Leads criados nos ultimos 30 dias comparados aos 30 dias anteriores.",
        drilldown: { href: "/leads", filters: { period: "30d" } },
      }),
      metric({
        id: "qualification_rate",
        label: "Taxa de qualificacao",
        value: percent(leads.filter((l) => l.status === "IN_PROGRESS").length, leads.length),
        unit: "%",
        formula: "leads IN_PROGRESS / total leads",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Aproximacao baseada no status IN_PROGRESS ate existir pipeline completo.",
        drilldown: { href: "/leads", filters: { status: "IN_PROGRESS" } },
      }),
      metric({
        id: "average_ticket",
        label: "Ticket medio",
        value: closedSales.length ? Math.round(closedRevenue / closedSales.length) : 0,
        unit: "BRL",
        formula: "sum(sales.final_price) / count(sales fechadas)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Ticket medio calculado sobre vendas confirmadas/fechadas.",
        drilldown: { href: "/leads", filters: { hasSales: "true" } },
      }),
    ],
    breakdowns: {
      leadsByStatus: countBy(leads, (l) => labelStatus(l.status)),
      leadsBySegment: countBy(leads, (l) => labelSegment(l.segment)),
      leadsByCity: countBy(leads, (l) => l.city ?? l.region),
      leadsByOrigin: countBy(leads, (l) => l.origem ?? l.channel_origin),
      salesByVendor: countBy(sales, (s) => vendors.find((v) => v.id === s.vendor_id)?.name),
    },
  };
}

export async function getPendingCenter(): Promise<PendingCenterResponse> {
  const supabase = createAdminClient();
  const { leads, followups, cobrancas } = await fetchCore();
  const [sheetSourcesRes, consumerRes, resellerRes, installerRes, builderRes] = await Promise.all([
    supabase.from("sheet_sources").select("*"),
    supabase.from("products_consumer").select("id,estoque"),
    supabase.from("products_reseller").select("id,estoque"),
    supabase.from("products_installer").select("id,estoque"),
    supabase.from("products_builder_architect").select("id"),
  ]);

  for (const res of [sheetSourcesRes, consumerRes, resellerRes, installerRes, builderRes]) {
    if (res.error) throw res.error;
  }

  const sheetSources = (sheetSourcesRes.data ?? []) as SheetSourceRow[];
  const productRows = [
    ...((consumerRes.data ?? []) as ProductRow[]),
    ...((resellerRes.data ?? []) as ProductRow[]),
    ...((installerRes.data ?? []) as ProductRow[]),
  ];
  const leadIdsWithFollowup = new Set(followups.map((f) => f.lead_id).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);

  return {
    generatedAt: nowIso(),
    items: [
      {
        id: "leads_without_owner",
        label: "Leads sem responsavel",
        count: leads.filter((l) => !l.owner_name).length,
        severity: "warning",
        formula: "count(leads where owner_name is null)",
        period: allTimePeriod(),
        tooltip: "Leads que ainda nao tem responsavel comercial definido.",
        drilldown: { href: "/leads", filters: { unassigned: "true" } },
      },
      {
        id: "leads_without_followup",
        label: "Leads sem follow-up",
        count: leads.filter((l) => l.status === "ACTIVE" && !leadIdsWithFollowup.has(l.id)).length,
        severity: "warning",
        formula: "count(active leads without matching followups.lead_id)",
        period: allTimePeriod(),
        tooltip: "Leads ativos sem registro correspondente na tabela followups.",
        drilldown: { href: "/leads", filters: { status: "ACTIVE", withoutFollowup: "true" } },
      },
      {
        id: "late_followups",
        label: "Follow-ups atrasados",
        count: followups.filter((f) => !f.respondeu && isOlderThan(f.created_at, 24)).length,
        severity: "danger",
        formula: "count(followups where respondeu=false and created_at older than 24h)",
        period: allTimePeriod(),
        tooltip: "Atraso estimado por created_at enquanto nao existir campo agendado_para.",
        drilldown: { href: "/leads", filters: { view: "followups", late: "true" } },
      },
      {
        id: "collections_due_today",
        label: "Cobrancas vencem hoje",
        count: cobrancas.filter((c) => c.vencimento === today && !c.pagamento_confirmado).length,
        severity: "info",
        formula: "count(cobranca_log where vencimento=today and pagamento_confirmado=false)",
        period: { label: "Hoje", from: `${today}T00:00:00.000Z`, to: `${today}T23:59:59.999Z` },
        tooltip: "Cobrancas importadas com vencimento no dia atual.",
        drilldown: { href: "/cobranca", filters: { vencimento: today } },
      },
      {
        id: "stale_integrations",
        label: "Fontes de estoque desatualizadas",
        count: sheetSources.filter((s) => isOlderThan(s.last_synced_at, 24)).length,
        severity: "danger",
        formula: "count(sheet_sources where last_synced_at older than 24h)",
        period: allTimePeriod(),
        tooltip: "Fontes de planilha/ERP sem sincronizacao nas ultimas 24 horas.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      },
      {
        id: "out_of_stock_products",
        label: "Produtos sem estoque",
        count: productRows.filter((p) => (p.estoque ?? 0) <= 0).length,
        severity: "warning",
        formula: "count(products_* where estoque <= 0)",
        period: allTimePeriod(),
        tooltip: "Produtos das tabelas segmentadas com estoque zerado ou negativo.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "out" } },
      },
    ],
  };
}

export async function getLeads(filters: LeadFilters): Promise<LeadsResponse> {
  const { leads, followups, conversations, vendors } = await fetchCore();
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const leadIdsWithFollowup = new Set(followups.map((f) => f.lead_id).filter(Boolean));
  const limit = Math.min(Number(filters.limit ?? 100) || 100, 500);
  const search = filters.search?.toLowerCase().trim();

  const items = leads
    .filter((lead) => {
      if (filters.segment && lead.segment !== filters.segment) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.city && (lead.city ?? lead.region) !== filters.city) return false;
      if (filters.origin && (lead.origem ?? lead.channel_origin) !== filters.origin) return false;
      if (filters.unassigned === "true" && lead.owner_name) return false;
      if (filters.withoutFollowup === "true" && leadIdsWithFollowup.has(lead.id)) return false;
      if (search) {
        const haystack = [lead.name, lead.wa_phone, lead.company, lead.city, lead.region].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .slice(0, limit)
    .map((lead) => mapLead(lead, vendorMap, conversations, followups));

  return {
    generatedAt: nowIso(),
    total: items.length,
    filters: {
      segment: filters.segment ?? null,
      status: filters.status ?? null,
      city: filters.city ?? null,
      origin: filters.origin ?? null,
      responsible: filters.responsible ?? null,
      search: filters.search ?? null,
    },
    items,
  };
}

export async function getLeadDetail(id: string): Promise<LeadDetailResponse | null> {
  const supabase = createAdminClient();
  const { leads, followups, conversations, vendors, cobrancas, quotes, sales } = await fetchCore();
  const lead = leads.find((l) => l.id === id);
  if (!lead) return null;

  const leadConversations = conversations.filter((c) => c.lead_id === id);
  const conversationIds = leadConversations.map((c) => c.id);
  const [messagesRes, imagesRes] = await Promise.all([
    conversationIds.length
      ? supabase.from("messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    lead.wa_phone
      ? supabase.from("generated_images").select("*").eq("phone_number", lead.wa_phone).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (imagesRes.error) throw imagesRes.error;

  const messages = (messagesRes.data ?? []) as MessageRow[];
  const images = (imagesRes.data ?? []) as GeneratedImageRow[];
  const leadFollowups = followups.filter((f) => f.lead_id === id || f.numero_cliente === lead.wa_phone);
  const leadCobrancas = cobrancas.filter((c) => c.telefone === lead.wa_phone);
  const leadQuotes = quotes.filter((q) => q.lead_id === id);
  const leadSales = sales.filter((s) => s.lead_id === id);
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));

  const timeline: LeadTimelineItem[] = [
    {
      id: lead.id,
      type: "lead" as const,
      title: "Lead criado",
      description: lead.name,
      occurredAt: lead.created_at,
    },
    ...leadConversations.map((c) => ({
      id: c.id,
      type: "conversation" as const,
      title: `Conversa ${c.channel ?? ""}`.trim(),
      description: c.intent ? `Intencao: ${labelSegment(c.intent)}` : null,
      occurredAt: c.started_at,
      metadata: { status: c.status, vendor: c.vendor_id ? vendorMap.get(c.vendor_id)?.name : null },
    })),
    ...messages.map((m) => ({
      id: m.id,
      type: "message" as const,
      title: m.role === "assistant" ? "Mensagem da IA" : "Mensagem do cliente",
      description: m.content,
      occurredAt: m.created_at,
      metadata: m.metadata ?? undefined,
    })),
    ...leadFollowups.map((f) => ({
      id: String(f.id),
      type: "followup" as const,
      title: f.respondeu ? "Follow-up respondido" : "Follow-up pendente",
      description: f.status,
      occurredAt: f.ultima_msg_lead ?? f.ultima_msg_ia ?? f.created_at,
      metadata: { tipo: f.tipo, followup_sent: f.followup_sent },
    })),
    ...leadCobrancas.map((c) => ({
      id: c.id,
      type: "collection" as const,
      title: "Cobranca",
      description: c.valor,
      occurredAt: c.data_disparo ?? c.created_at,
      metadata: { status_disparo: c.status_disparo, pagamento_confirmado: c.pagamento_confirmado },
    })),
    ...images.map((img) => ({
      id: img.id,
      type: "image" as const,
      title: "Imagem gerada",
      description: img.image_description,
      occurredAt: img.created_at,
      metadata: { url: img.url_imagem_final ?? img.storage_url, agent_type: img.agent_type },
    })),
    ...leadQuotes.map((q) => ({
      id: q.id,
      type: "quote" as const,
      title: "Orcamento",
      description: q.status,
      occurredAt: q.created_at,
      metadata: { price_offered: q.price_offered },
    })),
    ...leadSales.map((s) => ({
      id: s.id,
      type: "sale" as const,
      title: "Venda",
      description: s.status,
      occurredAt: s.confirmed_at,
      metadata: { final_price: s.final_price },
    })),
  ].filter((item) => item.occurredAt).sort((a, b) => new Date(b.occurredAt!).getTime() - new Date(a.occurredAt!).getTime());

  const nextAction = timeline.find((item) => item.type === "followup" && item.title.includes("pendente")) ?? null;

  return {
    generatedAt: nowIso(),
    lead: mapLead(lead, vendorMap, conversations, followups),
    summary: {
      conversations: leadConversations.length,
      messages: messages.length,
      followups: leadFollowups.length,
      collections: leadCobrancas.length,
      generatedImages: images.length,
      quotes: leadQuotes.length,
      sales: leadSales.length,
    },
    nextAction,
    timeline,
  };
}

export async function getAgentSummary(): Promise<AgentSummaryResponse> {
  const { leads, conversations, vendors } = await fetchCore();

  const agents: AgentSummaryItem[] = vendors.map((vendor) => {
    const segments = vendor.segment ?? [];
    const vendorConversations = conversations.filter((c) => c.vendor_id === vendor.id);
    const segmentLeads = leads.filter((l) => l.segment && segments.includes(l.segment));
    const lastActivityAt = vendorConversations
      .map((c) => c.started_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

    return {
      id: vendor.id,
      name: vendor.name ?? "Sem nome",
      segment: segments,
      enabled: vendor.active === true,
      status: vendor.active ? "online_unknown" : "disabled",
      waPhone: vendor.wa_phone,
      totalLeads: segmentLeads.length,
      activeLeads: segmentLeads.filter((l) => l.status === "ACTIVE").length,
      lostLeads: segmentLeads.filter((l) => l.status === "LOST").length,
      conversations: vendorConversations.length,
      lastActivityAt,
    };
  });

  return {
    generatedAt: nowIso(),
    metrics: [
      metric({
        id: "agents_configured",
        label: "Agentes cadastrados",
        value: vendors.length,
        formula: "count(vendors)",
        tooltip: "Todos os agentes cadastrados na tabela vendors.",
        drilldown: { href: "/agentes", filters: {} },
      }),
      metric({
        id: "agents_enabled",
        label: "Agentes habilitados",
        value: vendors.filter((v) => v.active).length,
        formula: "count(vendors where active = true)",
        tooltip: "Agentes habilitados para operacao; nao representa online real.",
        drilldown: { href: "/agentes", filters: { active: "true" } },
      }),
      metric({
        id: "agents_served_today",
        label: "Atenderam hoje",
        value: new Set(conversations.filter((c) => c.started_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).map((c) => c.vendor_id).filter(Boolean)).size,
        formula: "distinct vendor_id from conversations started today",
        period: { label: "Hoje", from: new Date().toISOString().slice(0, 10), to: new Date().toISOString() },
        tooltip: "Agentes com conversas iniciadas hoje.",
        drilldown: { href: "/agentes", filters: { activity: "today" } },
      }),
    ],
    agents,
  };
}

export async function getActivityLog(limit = 8): Promise<ActivityLogResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id,entity_type,action,wf_origin,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      action: row.action,
      wfOrigin: row.wf_origin,
      createdAt: row.created_at,
    })),
  };
}

export async function getVendorConversations(vendorId: string): Promise<AgentConversationsResponse | null> {
  const supabase = createAdminClient();
  const { vendors, leads } = await fetchCore();
  const vendor = vendors.find((v) => v.id === vendorId);
  if (!vendor) return null;

  const { data: conversationsData, error: conversationsError } = await supabase
    .from("conversations")
    .select("id,lead_id,channel,status,started_at")
    .eq("vendor_id", vendorId)
    .order("started_at", { ascending: false });
  if (conversationsError) throw conversationsError;

  const conversationRows = conversationsData ?? [];
  const conversationIds = conversationRows.map((c) => c.id);
  const { data: messagesData, error: messagesError } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("id,conversation_id,role,content,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messagesError) throw messagesError;

  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const conversations: AgentConversationsResponse["conversations"] = conversationRows.map((c) => {
    const lead = c.lead_id ? leadMap.get(c.lead_id) : null;
    return {
      id: c.id,
      leadName: lead?.name ?? null,
      leadPhone: lead?.wa_phone ?? null,
      channel: c.channel,
      status: c.status,
      startedAt: c.started_at,
      messages: (messagesData ?? [])
        .filter((m) => m.conversation_id === c.id)
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          createdAt: m.created_at,
        })),
    };
  });

  return {
    generatedAt: nowIso(),
    agentId: vendor.id,
    agentName: vendor.name ?? "Sem nome",
    conversations,
  };
}

async function fetchProducts(): Promise<InventoryProduct[]> {
  const supabase = createAdminClient();
  const [consumerRes, resellerRes, installerRes, builderRes] = await Promise.all([
    supabase.from("products_consumer").select("id,codigo_erp,nome,marca,btu,voltagem,preco_venda,estoque").order("nome"),
    supabase.from("products_reseller").select("id,codigo_erp,nome,marca,preco_venda,estoque").order("nome"),
    supabase.from("products_installer").select("id,codigo_erp,nome,categoria,preco_venda,estoque").order("nome"),
    supabase.from("products_builder_architect").select("id,codigo_erp,nome,preco_venda").order("nome"),
  ]);

  for (const res of [consumerRes, resellerRes, installerRes, builderRes]) {
    if (res.error) throw res.error;
  }

  const mapProduct = (source: InventoryProduct["source"], row: ProductRow): InventoryProduct => ({
    id: row.id,
    source,
    name: row.nome,
    brand: row.marca ?? null,
    category: row.categoria ?? null,
    btu: row.btu ?? null,
    voltage: row.voltagem ?? null,
    price: toNumber(row.preco_venda),
    stock: row.estoque ?? null,
    available: row.estoque ?? null,
    erpCode: row.codigo_erp,
  });

  return [
    ...((consumerRes.data ?? []) as ProductRow[]).map((p) => mapProduct("consumer", p)),
    ...((resellerRes.data ?? []) as ProductRow[]).map((p) => mapProduct("reseller", p)),
    ...((installerRes.data ?? []) as ProductRow[]).map((p) => mapProduct("installer", p)),
    ...((builderRes.data ?? []) as ProductRow[]).map((p) => mapProduct("builder_architect", p)),
  ];
}

async function fetchOutOfStockRequests(): Promise<InventorySummaryResponse["outOfStockRequests"]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("out_of_stock_requests")
    .select("id,product_name,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, productName: r.product_name, createdAt: r.created_at }));
}

export async function getInventorySummary(searchParams?: URLSearchParams): Promise<InventorySummaryResponse> {
  const [products, outOfStockRequests] = await Promise.all([fetchProducts(), fetchOutOfStockRequests()]);
  const q = searchParams?.get("search")?.toLowerCase().trim();
  const limit = Math.min(Number(searchParams?.get("limit") ?? 200) || 200, 1000);
  const filtered = products.filter((p) => {
    if (!q) return true;
    return [p.name, p.brand, p.category, p.btu, p.voltage, p.erpCode].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const outOfStock = outOfStockRequests.length;
  const lowStock = products.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 10).length;

  return {
    generatedAt: nowIso(),
    metrics: [
      metric({
        id: "total_products",
        label: "Total produtos",
        value: products.length,
        formula: "count(products_consumer + products_reseller + products_installer + products_builder_architect)",
        tooltip: "Total unificado das tabelas segmentadas de produtos.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      }),
      metric({
        id: "out_of_stock",
        label: "Sem estoque",
        value: outOfStock,
        formula: "count(out_of_stock_requests)",
        tooltip: "Solicitacoes de produtos que os agentes nao conseguiram atender por falta de estoque.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "out" } },
      }),
      metric({
        id: "low_stock",
        label: "Estoque baixo",
        value: lowStock,
        formula: "count(products where estoque between 1 and 10)",
        tooltip: "Produtos com estoque entre 1 e 10 unidades.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "low" } },
      }),
    ],
    products: filtered.slice(0, limit),
    outOfStockRequests,
    breakdowns: {
      bySource: countBy(products, (p) => p.source),
      lowStockBySource: countBy(products.filter((p) => (p.stock ?? 0) <= 10), (p) => p.source),
    },
  };
}
