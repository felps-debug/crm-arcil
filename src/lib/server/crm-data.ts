import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { allTimePeriod, countBy, defaultPeriod, isOlderThan, metric, percent } from "@/lib/server/crm-metrics";
import { isFollowupPendente } from "@/lib/followups";
import { selectAllPages } from "@/lib/server/select-all-pages";
import { fetchProductMetrics, type ProductMetrics } from "@/lib/server/product-metrics";

/**
 * Devedor nao e prospect.
 *
 * O disparo de cobranca grava o cliente inadimplente na tabela `leads` com
 * `segment=COBRANCA`. Sao 74 dos 82 leads ativos: o card "Leads ativos" dizia
 * 78 quando o funil comercial real tinha 8, e "Leads sem follow-up" era 100%
 * financeiro -- pedindo acao do time errado.
 *
 * Cobranca tem tela, regua e board proprios. Aqui so entram os comerciais.
 * Metrica de handoff financeiro NAO usa isto de proposito: ali o publico e
 * justamente o devedor.
 */
const SEGMENTO_COBRANCA = "COBRANCA";
const ehLeadComercial = (lead: { segment: string | null }) => lead.segment !== SEGMENTO_COBRANCA;

import { labelSegment, labelStatus } from "@/lib/server/crm-labels";
import { agruparDemanda } from "@/lib/server/demanda";
import {
  classifyFinancialHandoff,
  type FinancialBoardItem,
  type FinancialHandoffBoleto,
  type FinancialHandoffDecision,
} from "@/lib/server/financial-handoff";
import type {
  ActivityItem,
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
  handoff_vendor_id?: string | null;
  handoff_sent_at?: string | null;
  handoff_accepted_at?: string | null;
  handoff_staff_ok_at?: string | null;
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
  updated_at: string | null;
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
  /** Id da conversa no Chatwoot. Preenchido pelo n8n quando o agente de IA
   *  assume — é o que separa atendimento do agente de disparo de cobrança. */
  chatwoot_conv_id: string | null;
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
  chatwoot_inbox_id: number | null;
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
  metadata: Record<string, unknown> | null;
};

type FinancialHandoffDecisionRow = {
  empresa: string | null;
  documento: string | null;
  status: "pago" | "renegociado" | "juridico" | null;
  note: string | null;
  promised_at: string | null;
  recorded_at: string | null;
};

type FinancialHandoffResolutionRow = {
  id: string;
  lead_id: string;
  destination: "devolver_ao_bot" | "sem_retorno";
  recorded_at: string;
  followup_at: string | null;
  followup_status: string | null;
  n8n_status: "pending" | "delivered" | "failed";
};

type FinancialPositionRow = {
  cobranca_log_id: string;
  telefone: string | null;
  empresa: string | null;
  documento: string | null;
  valor: number | string | null;
  vencimento: string | null;
  status: string | null;
  observacao: string | null;
};

/** Imagens geradas pelo n8n, indexadas por telefone. */
type GeneratedImageRow = {
  id: string;
  phone_number: string | null;
  storage_url: string | null;
  url_imagem_final: string | null;
  agent_type: string | null;
  created_at: string | null;
  image_description: string | null;
};

/** Imagens geradas dentro do CRM (/chatbot), indexadas por lead_id. Tabela
 * separada da acima porque o produtor e as colunas são outros. */
type CrmImageRow = {
  id: string;
  lead_id: string | null;
  user_name: string | null;
  generated_image_url: string | null;
  created_at: string | null;
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
  imagem_url?: string | null;
  sku?: string | null;
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
  /** "pending": encaminhado ao vendedor e ainda sem aceite. */
  handoff?: string | null;
  /** "30d": criados na janela padrão do dashboard. */
  period?: string | null;
  /** "true": follow-up enviado e sem resposta há mais tempo que o aceitável. */
  late?: string | null;
  hasQuotes?: string | null;
  hasSales?: string | null;
  /** "true": follow-up enviado e já respondido. */
  respondeu?: string | null;
  /** "true": só pipeline comercial — tira quem é `segment=COBRANCA`.
   *  Existe separado de `segment` porque mandar o segmento para a API faz a
   *  lista voltar só com ele, e as abas da tela (derivadas da lista) se
   *  apagam sozinhas. Este só exclui, não restringe. */
  comercial?: string | null;
  limit?: string | null;
};

const LEAD_SELECT = "id,wa_phone,name,company,region,channel_origin,segment,status,lead_score,created_at,updated_at,owner_name,city,origem,handoff_vendor_id,handoff_sent_at,handoff_accepted_at,handoff_staff_ok_at";

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

/** Contagem por dia no intervalo, com os dias vazios preenchidos com 0 — senao
 * o grafico liga dois dias distantes com uma reta e inventa uma tendencia. */
function dailySeries(dates: (string | null)[], from: Date, to: Date) {
  const buckets = new Map<string, number>();
  for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    buckets.set(cursor.toISOString().slice(0, 10), 0);
  }
  for (const date of dates) {
    if (!date) continue;
    const key = new Date(date).toISOString().slice(0, 10);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}

function mapLead(lead: LeadRow, vendors: Map<string, VendorRow>, conversations: ConversationRow[], followups: FollowupRow[]): LeadListItem {
  const leadConversations = conversations.filter((c) => c.lead_id === lead.id);
  const lastConversation = leadConversations
    .filter((c) => c.started_at)
    .sort((a, b) => new Date(b.started_at!).getTime() - new Date(a.started_at!).getTime())[0];
  const aiAgent = lastConversation?.vendor_id ? vendors.get(lastConversation.vendor_id)?.name ?? null : null;
  const leadFollowups = followups.filter((f) => f.lead_id === lead.id);
  // Regra em @/lib/followups: linha de fila (followup_step 0, followup_sent
  // false) nao e pendencia -- so conta a que foi disparada e ficou sem resposta.
  const nextFollowup = leadFollowups
    .filter((f) => isFollowupPendente(f) && f.created_at)
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
    handoffVendor: lead.handoff_vendor_id ? vendors.get(lead.handoff_vendor_id)?.name ?? null : null,
    handoffSentAt: lead.handoff_sent_at ?? null,
    handoffAcceptedAt: lead.handoff_accepted_at ?? null,
    hasConversation: leadConversations.length > 0,
    awaitingFollowup: Boolean(nextFollowup),
    leadScore: lead.lead_score,
    lastContactAt: lastConversation?.started_at ?? lead.updated_at,
    awaitingSince: nextFollowup?.created_at ?? null,
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

function phoneTail(phone: string | null | undefined) {
  const normalized = String(phone ?? "").replace(/\D/g, "");
  return normalized.length >= 8 ? normalized.slice(-8) : null;
}

function parseCobrancaMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const clean = value.replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSnapshotBoletos(metadata: Record<string, unknown> | null) {
  const boletos = metadata?.boletos;
  if (!Array.isArray(boletos)) return [];
  return boletos.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const boleto = value as Record<string, unknown>;
    const empresa = typeof boleto.emp === "string" ? boleto.emp.trim() : "";
    const documento = typeof boleto.documento === "string" ? boleto.documento.trim() : "";
    if (!empresa || !documento) return [];
    return [{
      empresa,
      documento,
      valor: parseCobrancaMoney(boleto.valor),
      vencimento: typeof boleto.vencimento === "string" ? boleto.vencimento : null,
      status: typeof boleto.status === "string" ? boleto.status : null,
      observacao: typeof boleto.observacao === "string" ? boleto.observacao : null,
    }];
  });
}

/**
 * Janela de reuso das tabelas do núcleo.
 *
 * Uma carga do dashboard dispara quatro chamadas em paralelo (`summary`,
 * `pending-center`, `agents/summary`, `inventory/summary`) e três delas passam
 * por aqui — sem isto, cada uma refazia as sete varreduras, 21 no total, para
 * responder o mesmo instante. Pior: o realtime chama refresh a cada linha
 * alterada, então um lote do n8n multiplicava tudo de novo.
 *
 * Cinco segundos é curto o bastante para o painel continuar parecendo vivo (o
 * gatilho da atualização segue sendo o evento do Postgres, não um relógio) e
 * longo o bastante para que as chamadas de uma mesma carga compartilhem uma
 * única ida ao banco.
 */
const CORE_TTL_MS = 5_000;

type CoreCacheEntry = { at: number; rows: Promise<unknown[]> };
const coreCache = new Map<string, CoreCacheEntry>();

/**
 * Guarda a *promise*, não o resultado. As três rotas do dashboard saem juntas,
 * antes de qualquer uma terminar; guardando só o valor pronto elas ainda
 * abririam três consultas idênticas em voo. Compartilhando a promise, a
 * primeira busca e as outras duas esperam nela.
 */
function cachedTable<T>(key: string, run: () => Promise<T[]>): Promise<T[]> {
  const now = Date.now();
  const hit = coreCache.get(key);
  if (hit && now - hit.at < CORE_TTL_MS) return hit.rows as Promise<T[]>;

  const rows = run();

  // Uma falha não pode ficar memorizada por 5s: some com a entrada para que a
  // próxima chamada tente de novo em vez de herdar a promise rejeitada.
  rows.catch(() => coreCache.delete(key));
  coreCache.set(key, { at: now, rows });
  return rows;
}

/**
 * Colunas lidas das tabelas do núcleo: exatamente os campos dos tipos *Row
 * acima, que são tudo o que este arquivo consegue ler sem erro de tipo. Antes
 * era `select("*")`, e `cobranca_log.metadata` sozinho já é o grosso do payload.
 */
const CORE_COLUMNS = {
  followups: "id,lead_id,nome_cliente,numero_cliente,tipo,status,respondeu,followup_sent,created_at,updated_at,ultima_msg_ia,ultima_msg_lead",
  conversations: "id,lead_id,channel,intent,status,vendor_id,chatwoot_conv_id,started_at,ended_at",
  vendors: "id,name,segment,wa_phone,active,created_at,chatwoot_inbox_id",
  cobrancas: "id,telefone,nome,valor,vencimento,status_disparo,respondeu,pagamento_confirmado,data_disparo,created_at,metadata",
  quotes: "id,lead_id,price_offered,status,created_at",
  sales: "id,lead_id,vendor_id,final_price,status,confirmed_at",
} as const;

// Todas passam por selectAllPages: o PostgREST corta em 1.000 linhas sem
// avisar, e `cobranca_log` cresce até 1.000 linhas por disparo. Com o corte, o
// "Em aberto" do dashboard pararia de somar sem erro nenhum.
const coreTables = {
  leads: () =>
    cachedTable<LeadRow>("leads", () =>
      selectAllPages<LeadRow>((from, to) =>
        createAdminClient().from("leads").select(LEAD_SELECT).order("created_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  followups: () =>
    cachedTable<FollowupRow>("followups", () =>
      selectAllPages<FollowupRow>((from, to) =>
        createAdminClient().from("followups").select(CORE_COLUMNS.followups).order("created_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  conversations: () =>
    cachedTable<ConversationRow>("conversations", () =>
      selectAllPages<ConversationRow>((from, to) =>
        createAdminClient().from("conversations").select(CORE_COLUMNS.conversations).order("started_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  vendors: () =>
    cachedTable<VendorRow>("vendors", () =>
      selectAllPages<VendorRow>((from, to) =>
        createAdminClient().from("vendors").select(CORE_COLUMNS.vendors).order("created_at", { ascending: true }).order("id").range(from, to)
      )
    ),
  cobrancas: () =>
    cachedTable<CobrancaRow>("cobranca_log", () =>
      selectAllPages<CobrancaRow>((from, to) =>
        createAdminClient().from("cobranca_log").select(CORE_COLUMNS.cobrancas).order("created_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  quotes: () =>
    cachedTable<QuoteRow>("quotes", () =>
      selectAllPages<QuoteRow>((from, to) =>
        createAdminClient().from("quotes").select(CORE_COLUMNS.quotes).order("created_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  sales: () =>
    cachedTable<SaleRow>("sales", () =>
      selectAllPages<SaleRow>((from, to) =>
        createAdminClient().from("sales").select(CORE_COLUMNS.sales).order("confirmed_at", { ascending: false }).order("id").range(from, to)
      )
    ),
  /** Só decisões vivas: uma correção supersede a anterior, e somar as duas
   *  contaria o mesmo boleto duas vezes no total recebido. */
  handoffDecisions: () =>
    cachedTable<HandoffDecisionLite>("cobranca_handoff_boleto_decisions", () =>
      selectAllPages<HandoffDecisionLite>((from, to) =>
        createAdminClient()
          .from("cobranca_handoff_boleto_decisions")
          .select("empresa,documento,status,cobranca_log_id")
          .is("superseded_at", null)
          .order("recorded_at", { ascending: false })
          .order("id")
          .range(from, to)
      )
    ),
};

type HandoffDecisionLite = {
  empresa: string | null;
  documento: string | null;
  status: string | null;
  cobranca_log_id: string | null;
};

/**
 * Quanto já entrou de cobrança. O valor de cada boleto vive no snapshot do
 * disparo (`cobranca_log.metadata`), não na tabela de decisões, então o
 * cruzamento é por disparo + empresa + documento.
 */
function sumReceived(
  cobrancas: CobrancaRow[],
  decisions: { empresa: string | null; documento: string | null; status: string | null; cobranca_log_id: string | null }[]
) {
  const paidKeys = new Set(
    decisions
      .filter((decision) => decision.status === "pago" && decision.cobranca_log_id && decision.empresa && decision.documento)
      .map((decision) => `${decision.cobranca_log_id}\u0000${decision.empresa}\u0000${decision.documento}`)
  );
  if (!paidKeys.size) return 0;

  return cobrancas.reduce((total, cobranca) => {
    const paid = parseSnapshotBoletos(cobranca.metadata).filter((boleto) =>
      paidKeys.has(`${cobranca.id}\u0000${boleto.empresa}\u0000${boleto.documento}`)
    );
    return total + paid.reduce((sum, boleto) => sum + boleto.valor, 0);
  }, 0);
}

export type CoreData = Awaited<ReturnType<typeof fetchCore>>;

export async function fetchCore() {
  const [leads, followups, conversations, vendors, cobrancas, quotes, sales] = await Promise.all([
    coreTables.leads(),
    coreTables.followups(),
    coreTables.conversations(),
    coreTables.vendors(),
    coreTables.cobrancas(),
    coreTables.quotes(),
    coreTables.sales(),
  ]);

  return { leads, followups, conversations, vendors, cobrancas, quotes, sales };
}

export function fetchHandoffDecisions() {
  return coreTables.handoffDecisions();
}

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const [core, handoffDecisions, productMetrics] = await Promise.all([
    fetchCore(),
    fetchHandoffDecisions(),
    fetchProductMetrics(),
  ]);
  return buildSummary(core, handoffDecisions, productMetrics);
}

/**
 * As seções do dashboard recebem os dados já carregados e não buscam nada por
 * conta própria. É isso que deixa o snapshot (/api/dashboard/snapshot) ler cada
 * tabela uma vez só para montar todas elas, e garante que resumo, pendências e
 * estoque saem do mesmo instante.
 */
export function buildSummary(
  core: CoreData,
  handoffDecisions: HandoffDecisionLite[],
  productMetrics: ProductMetrics
): DashboardSummaryResponse {
  const { leads, followups, vendors, quotes, sales, cobrancas, conversations: conversas } = core;
  const produtosDisponiveis = productMetrics.disponiveis;
  // `chatwoot_conv_id` preenchido é a marca de que o agente de IA assumiu a
  // conversa — as linhas OUTBOUND de cobrança não têm, porque são disparo, não
  // atendimento.
  const conversasDoAgente = conversas.filter((c) => c.chatwoot_conv_id);
  const receivedRevenue = sumReceived(cobrancas, handoffDecisions);
  // Soma pelo campo `valor` da própria linha, não por `metadata.boletos`: uma
  // linha recusada no disparo (telefone fixo/vazio) nunca teve boleto nenhum
  // parseado no metadata, mas o valor devido é real e já está em `valor` —
  // somar só por boleto fazia o card "Em aberto" ficar R$1.551,17 (depois
  // R$83.365,00, com um disparo maior) menor que a tela /cobranca, que sempre
  // usou este mesmo campo.
  const openCollections = cobrancas
    .filter((cobranca) => !cobranca.pagamento_confirmado)
    .reduce((sum, cobranca) => sum + parseCobrancaMoney(cobranca.valor), 0);
  const { from, to, previousFrom } = previousWindow();
  const sentFollowups = followups.filter((f) => f.followup_sent);
  const answeredFollowups = sentFollowups.filter((f) => f.respondeu);
  const closedSales = sales.filter((s) => s.status === "CLOSED" || s.status === "CONFIRMED" || s.confirmed_at);
  const potentialRevenue = quotes.reduce((sum, q) => sum + (q.price_offered ?? 0), 0);
  const closedRevenue = closedSales.reduce((sum, s) => sum + (s.final_price ?? 0), 0);
  const period = defaultPeriod();

  // Cobranca fica de fora de tudo que e funil comercial. Ver ehLeadComercial.
  const leadsComerciais = leads.filter(ehLeadComercial);
  const currentLeads = leadsComerciais.filter((l) => inRange(l.created_at, from, to)).length;
  const previousLeads = leadsComerciais.filter((l) => inRange(l.created_at, previousFrom, from)).length;
  // Comparação tem que ser taxa contra taxa. Antes o "vs ant." da taxa de
  // resposta usava a CONTAGEM de follow-ups do periodo anterior, então um
  // percentual era comparado com um número absoluto e o delta saía sem sentido.
  const previousSent = sentFollowups.filter((f) => inRange(f.created_at, previousFrom, from));
  const previousResponseRate = percent(previousSent.filter((f) => f.respondeu).length, previousSent.length);

  return {
    generatedAt: nowIso(),
    period,
    metrics: [
      metric({
        id: "total_leads",
        label: "Total leads",
        value: leadsComerciais.length,
        formula: "count(leads where segment <> COBRANCA)",
        period: allTimePeriod(),
        // Base completa não tem "periodo anterior" — comparar o total histórico
        // com a contagem de 30 dias atrás gerava um delta% inventado.
        // A comparação por periodo vive em new_leads_30d, abaixo.
        previous: null,
        tooltip: "Leads comerciais, sem filtrar por status. Clientes de cobrança têm tela própria e não entram aqui.",
        drilldown: { href: "/leads", filters: { comercial: "true" } },
      }),
      metric({
        id: "active_leads",
        label: "Leads ativos",
        value: leadsComerciais.filter((l) => l.status === "ACTIVE").length,
        formula: "count(leads where status = ACTIVE and segment <> COBRANCA)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Leads comerciais com status ACTIVE. Devedor em cobrança não é prospect e sai desta conta.",
        drilldown: { href: "/leads", filters: { status: "ACTIVE", comercial: "true" } },
      }),
      metric({
        id: "potential_revenue",
        label: "Receita potencial",
        value: potentialRevenue,
        unit: "BRL",
        formula: "sum(quotes.price_offered)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Soma dos valores ofertados em orçamentos registrados.",
        drilldown: { href: "/leads", filters: { hasQuotes: "true" } },
      }),
      // Dinheiro que entrou de verdade, vindo das baixas de boleto no
      // atendimento financeiro. É o número que o Paulo procura primeiro, e até
      // aqui o painel só sabia dizer quanto FALTAVA receber.
      metric({
        id: "received_revenue",
        label: "Recebido",
        value: receivedRevenue,
        unit: "BRL",
        formula: "sum(boletos com decisão viva status = pago)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Boletos baixados como pagos no atendimento financeiro.",
        drilldown: { href: "/cobranca", filters: {} },
      }),
      metric({
        id: "open_collections",
        label: "Em aberto",
        value: openCollections,
        unit: "BRL",
        formula: "sum(boletos de cobranças sem pagamento confirmado)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Total ainda em cobrança, somando os boletos dos disparos não quitados.",
        drilldown: { href: "/cobranca", filters: {} },
      }),
      metric({
        id: "followup_response_rate",
        label: "Taxa de resposta",
        value: percent(answeredFollowups.length, sentFollowups.length),
        unit: "%",
        formula: `${answeredFollowups.length} respostas / ${sentFollowups.length} follow-ups enviados`,
        period: allTimePeriod(),
        previous: previousResponseRate,
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
        tooltip: "Agentes cadastrados como ativos. Não significa online em tempo real.",
        drilldown: { href: "/agentes", filters: { active: "true" } },
      }),
      // Conta a tabela `conversations`, não o total do Chatwoot.
      //
      // Um inbox é um número de WhatsApp, e o mesmo número atende com IA e com
      // humano: o agente responde primeiro e transfere, o vendedor segue na
      // mesma conversa. Existem também conversas que nunca passaram pelo agente
      // — cliente antigo falando direto com o vendedor. Contar o inbox inteiro
      // misturava as três coisas e dava 3.107, número que não mede agente
      // nenhum. Aqui entra só o que o agente atendeu, porque é o n8n que grava
      // esta linha quando assume a conversa.
      metric({
        id: "agent_conversations",
        label: "Atendimentos do agente",
        value: conversasDoAgente.length,
        formula: "count(conversations where chatwoot_conv_id is not null)",
        period: allTimePeriod(),
        previous: null,
        tooltip:
          "Conversas que passaram pelo agente de IA. O n8n registra aqui quando o agente assume — conversa que só teve humano não entra.",
        drilldown: { href: "/agentes", filters: {} },
      }),
      metric({
        id: "produtos_disponiveis",
        label: "Disponível para venda",
        value: produtosDisponiveis,
        formula: "count(distinct codigo_erp em products_* where max(estoque) > 0)",
        period: allTimePeriod(),
        previous: null,
        tooltip:
          "Produtos com saldo nos depósitos de venda (HLB MS, HLB Parana e Londrina PDV). O painel só mostrava o que faltava; isto é o que dá para vender.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      }),
    ],
    commercialFunnel: [
      { id: "received", label: "Recebidos", value: leadsComerciais.length },
      { id: "answered", label: "Respondidos", value: answeredFollowups.length },
      { id: "qualified", label: "Qualificados", value: leadsComerciais.filter((l) => l.status === "IN_PROGRESS").length },
      { id: "quoted", label: "Orçamento enviado", value: quotes.length },
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
        tooltip: "Leads criados nos últimos 30 dias comparados aos 30 dias anteriores.",
        drilldown: { href: "/leads", filters: { period: "30d", comercial: "true" } },
      }),
      metric({
        id: "qualification_rate",
        label: "Taxa de qualificação",
        value: percent(leadsComerciais.filter((l) => l.status === "IN_PROGRESS").length, leadsComerciais.length),
        unit: "%",
        formula: "leads comerciais IN_PROGRESS / total de leads comerciais",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Aproximação baseada no status IN_PROGRESS até existir pipeline completo.",
        drilldown: { href: "/leads", filters: { status: "IN_PROGRESS", comercial: "true" } },
      }),
      metric({
        id: "average_ticket",
        label: "Ticket médio",
        value: closedSales.length ? Math.round(closedRevenue / closedSales.length) : 0,
        unit: "BRL",
        formula: "sum(sales.final_price) / count(sales fechadas)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Ticket médio calculado sobre vendas confirmadas/fechadas.",
        drilldown: { href: "/leads", filters: { hasSales: "true" } },
      }),
    ],
    leadsPerDay: dailySeries(leads.map((l) => l.created_at), from, to),
    breakdowns: {
      leadsByStatus: countBy(leads, (l) => l.status, labelStatus),
      leadsBySegment: countBy(leads, (l) => l.segment, labelSegment),
      leadsByCity: countBy(leads, (l) => l.city ?? l.region),
      leadsByOrigin: countBy(leads, (l) => l.origem ?? l.channel_origin),
      salesByVendor: countBy(sales, (s) => vendors.find((v) => v.id === s.vendor_id)?.name),
    },
  };
}

export async function getPendingCenter(): Promise<PendingCenterResponse> {
  return buildPending(await fetchCore());
}

/**
 * Lead que chegou há pouco ainda está com a agente de triagem: contar como
 * "sem responsável" no primeiro minuto acusava pendência enquanto a IA ainda
 * conversava. Duas horas é a janela para a triagem terminar.
 */
export const SEM_RESPONSAVEL_APOS_HORAS = 2;

/** Regra única do card "Leads sem responsável" e do filtro `unassigned` em /leads. */
export function isLeadSemResponsavel(lead: LeadRow): boolean {
  return (
    ehLeadComercial(lead) &&
    !lead.owner_name &&
    !lead.handoff_vendor_id &&
    isOlderThan(lead.created_at, SEM_RESPONSAVEL_APOS_HORAS)
  );
}

export const FOLLOWUP_ATRASADO_APOS_HORAS = 24;

/**
 * Regra única do card "Follow-ups atrasados" e do filtro `late` em /leads.
 *
 * - Só comercial: follow-up de cobrança é da régua do financeiro, que tem tela
 *   própria. Antes um devedor sem resposta aparecia em vermelho no painel
 *   comercial.
 * - Atraso contado da ÚLTIMA mensagem da IA, não da criação da linha: uma
 *   linha criada há 5 dias com mensagem enviada ontem não está atrasada.
 */
export function isFollowupAtrasado(followup: FollowupRow, leadsById: Map<string, LeadRow>): boolean {
  if (!isFollowupPendente(followup) || followup.tipo === "cobranca") return false;
  const lead = followup.lead_id ? leadsById.get(followup.lead_id) : undefined;
  if (lead && !ehLeadComercial(lead)) return false;
  const ultimoContato = followup.ultima_msg_ia ?? followup.updated_at ?? followup.created_at;
  return isOlderThan(ultimoContato, FOLLOWUP_ATRASADO_APOS_HORAS);
}

export function buildPending(core: CoreData): PendingCenterResponse {
  const { leads, followups, cobrancas } = core;
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const leadIdsWithFollowup = new Set(followups.map((f) => f.lead_id).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);

  return {
    generatedAt: nowIso(),
    items: [
      {
        id: "leads_without_owner",
        label: "Leads sem responsável",
        count: leads.filter(isLeadSemResponsavel).length,
        severity: "warning",
        formula: `count(leads where owner_name is null and handoff_vendor_id is null and segment <> COBRANCA and created_at older than ${SEM_RESPONSAVEL_APOS_HORAS}h)`,
        period: allTimePeriod(),
        tooltip: `Leads comerciais há mais de ${SEM_RESPONSAVEL_APOS_HORAS}h sem vendedor: a triagem não terminou nem encaminhou. Cobrança tem fluxo próprio e não entra aqui.`,
        drilldown: { href: "/leads", filters: { unassigned: "true", comercial: "true" } },
      },
      {
        // O estado perigoso do handoff por WhatsApp: a mensagem saiu para o
        // vendedor, o lead consta como encaminhado, e ninguem confirmou que
        // assumiu. Sem este alerta so se descobre quando o cliente cobra.
        id: "handoff_without_acceptance",
        label: "Handoff sem aceite",
        count: leads.filter((l) => l.handoff_sent_at && !l.handoff_accepted_at).length,
        severity: "danger",
        formula: "count(leads where handoff_sent_at is not null and handoff_accepted_at is null)",
        period: allTimePeriod(),
        tooltip: "Encaminhados ao vendedor por WhatsApp que ainda não foram assumidos por ninguém.",
        drilldown: { href: "/leads", filters: { handoff: "pending" } },
      },
      {
        id: "leads_without_followup",
        label: "Leads sem follow-up",
        count: leads.filter((l) => ehLeadComercial(l) && l.status === "ACTIVE" && !leadIdsWithFollowup.has(l.id)).length,
        severity: "warning",
        formula: "count(active commercial leads without matching followups.lead_id)",
        period: allTimePeriod(),
        tooltip: "Leads comerciais ativos sem registro em followups. Antes este card era 100% devedor, pedindo ação do time errado.",
        drilldown: { href: "/leads", filters: { status: "ACTIVE", withoutFollowup: "true", comercial: "true" } },
      },
      {
        id: "late_followups",
        label: "Follow-ups atrasados",
        // isFollowupPendente exige followup_sent: sem isso o card contava as
        // linhas de fila criadas junto com o lead e acusava atraso inexistente.
        count: followups.filter((f) => isFollowupAtrasado(f, leadsById)).length,
        severity: "danger",
        formula: `count(followups comerciais where followup_sent=true and respondeu is not true and status=PENDING and ultima_msg_ia older than ${FOLLOWUP_ATRASADO_APOS_HORAS}h)`,
        period: allTimePeriod(),
        tooltip: `Follow-ups comerciais sem resposta há mais de ${FOLLOWUP_ATRASADO_APOS_HORAS}h desde a última mensagem da IA. Cobrança tem régua própria e não entra aqui.`,
        drilldown: { href: "/leads", filters: { view: "followups", late: "true" } },
      },
      {
        id: "collections_due_today",
        label: "Cobranças vencem hoje",
        count: cobrancas.filter((c) => c.vencimento === today && !c.pagamento_confirmado).length,
        severity: "info",
        formula: "count(cobranca_log where vencimento=today and pagamento_confirmado=false)",
        period: { label: "Hoje", from: `${today}T00:00:00.000Z`, to: `${today}T23:59:59.999Z` },
        tooltip: "Cobrancas importadas com vencimento no dia atual.",
        drilldown: { href: "/cobranca", filters: { vencimento: today } },
      },
      // O antigo "Fontes de estoque desatualizadas" (stale_integrations) saiu
      // daqui: contava sheet_sources, que são as planilhas de prospecção de
      // outro sistema — não estoque. Aparecia em vermelho como a pendência
      // mais grave do painel sem ter nada a ver com o CRM.
      // "Produtos sem estoque" (out_of_stock_products) também saiu: eram ~1.100
      // itens do catálogo com saldo 0 no ERP — peças, metades de split e modelos
      // parados. Não é fila que alguém trate, e inflava "Filas abertas". O número
      // continua em Demanda & Estoque ("Zerados no ERP").
    ],
  };
}

export async function getLeads(filters: LeadFilters): Promise<LeadsResponse> {
  const { leads, followups, conversations, vendors, quotes, sales } = await fetchCore();
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const leadIdsWithFollowup = new Set(followups.map((f) => f.lead_id).filter(Boolean));
  const limit = Math.min(Number(filters.limit ?? 100) || 100, 500);
  const search = filters.search?.toLowerCase().trim();

  // Um lead pode ter vários follow-ups; o que importa é se ALGUM está no estado
  // que o card do dashboard contou.
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const leadIdsComFollowupAtrasado = new Set(
    followups.filter((f) => isFollowupAtrasado(f, leadsById)).map((f) => f.lead_id),
  );
  const leadIdsQueResponderam = new Set(
    followups.filter((f) => f.followup_sent && f.respondeu).map((f) => f.lead_id),
  );
  const leadIdsComOrcamento = new Set(quotes.map((q) => q.lead_id).filter(Boolean));
  const leadIdsComVenda = new Set(sales.map((s) => s.lead_id).filter(Boolean));
  const { from: periodoDe, to: periodoAte } = previousWindow();

  const items = leads
    .filter((lead) => {
      if (filters.segment && lead.segment !== filters.segment) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.city && (lead.city ?? lead.region) !== filters.city) return false;
      if (filters.origin && (lead.origem ?? lead.channel_origin) !== filters.origin) return false;
      // Mesma fórmula do card "Leads sem responsável". Só `owner_name` deixava
      // passar quem já foi encaminhado a um vendedor, então a contagem do card
      // e o tamanho da lista nunca batiam.
      if (filters.unassigned === "true" && !isLeadSemResponsavel(lead)) return false;
      if (filters.withoutFollowup === "true" && leadIdsWithFollowup.has(lead.id)) return false;
      if (filters.handoff === "pending" && !(lead.handoff_sent_at && !lead.handoff_accepted_at)) return false;
      if (filters.late === "true" && !leadIdsComFollowupAtrasado.has(lead.id)) return false;
      if (filters.respondeu === "true" && !leadIdsQueResponderam.has(lead.id)) return false;
      if (filters.hasQuotes === "true" && !leadIdsComOrcamento.has(lead.id)) return false;
      if (filters.hasSales === "true" && !leadIdsComVenda.has(lead.id)) return false;
      if (filters.comercial === "true" && lead.segment === SEGMENTO_COBRANCA) return false;
      if (filters.period === "30d" && !inRange(lead.created_at, periodoDe, periodoAte)) return false;
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

export async function getFinancialHandoffBoard(): Promise<FinancialBoardItem[]> {
  const supabase = createAdminClient();
  const [leadsRes, snapshotsRes, decisionsRes, resolutionsRes, positionRes] = await Promise.all([
    supabase.from("leads").select(LEAD_SELECT).eq("segment", "COBRANCA"),
    supabase.from("cobranca_log").select("id,telefone,nome,valor,vencimento,status_disparo,respondeu,pagamento_confirmado,data_disparo,created_at,metadata").order("data_disparo", { ascending: false }),
    supabase.from("cobranca_handoff_boleto_decisions").select("lead_id,empresa,documento,status,note,promised_at,recorded_at").is("superseded_at", null).order("recorded_at", { ascending: false }),
    supabase.from("financial_handoff_resolutions").select("id,lead_id,destination,recorded_at,followup_at,followup_status,n8n_status").order("recorded_at", { ascending: false }),
    supabase.from("cobranca_handoff_posicao_atual").select("cobranca_log_id,telefone,empresa,documento,valor,vencimento,status,observacao"),
  ]);

  for (const result of [leadsRes, snapshotsRes, decisionsRes, resolutionsRes, positionRes]) {
    if (result.error) throw result.error;
  }

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const snapshots = (snapshotsRes.data ?? []) as CobrancaRow[];
  const positions = (positionRes.data ?? []) as FinancialPositionRow[];
  const decisions = (decisionsRes.data ?? []) as (FinancialHandoffDecisionRow & { lead_id: string })[];
  const resolutions = (resolutionsRes.data ?? []) as FinancialHandoffResolutionRow[];
  const latestSnapshotByPhone = new Map<string, CobrancaRow>();
  for (const snapshot of snapshots) {
    const tail = phoneTail(snapshot.telefone);
    if (tail && parseSnapshotBoletos(snapshot.metadata).length && !latestSnapshotByPhone.has(tail)) latestSnapshotByPhone.set(tail, snapshot);
  }

  const positionByPhone = new Map<string, FinancialHandoffBoleto[]>();
  for (const row of positions) {
    const tail = phoneTail(row.telefone);
    if (!tail || !row.empresa || !row.documento) continue;
    const boletos = positionByPhone.get(tail) ?? [];
    boletos.push({
      empresa: row.empresa,
      documento: row.documento,
      valor: Number(row.valor ?? 0),
      vencimento: row.vencimento,
      status: row.status,
      observacao: row.observacao,
    });
    positionByPhone.set(tail, boletos);
  }

  const decisionsByLead = new Map<string, FinancialHandoffDecision[]>();
  for (const decision of decisions) {
    if (!decision.empresa || !decision.documento || !decision.status) continue;
    const current = decisionsByLead.get(decision.lead_id) ?? [];
    current.push({ empresa: decision.empresa, documento: decision.documento, status: decision.status, note: decision.note, promisedAt: decision.promised_at ?? null });
    decisionsByLead.set(decision.lead_id, current);
  }
  const latestResolutionByLead = new Map<string, FinancialHandoffResolutionRow>();
  for (const resolution of resolutions) {
    if (!latestResolutionByLead.has(resolution.lead_id)) latestResolutionByLead.set(resolution.lead_id, resolution);
  }

  return leads.flatMap((lead) => {
    const tail = phoneTail(lead.wa_phone);
    if (!tail || !lead.wa_phone) return [];
    const snapshot = latestSnapshotByPhone.get(tail) ?? null;
    const boletos = positionByPhone.get(tail) ?? [];
    const resolution = latestResolutionByLead.get(lead.id) ?? null;

    // Quanto já entrou. A tabela de decisões guarda empresa+documento+status mas
    // não o valor, então o valor vem do snapshot do disparo; o cruzamento é por
    // empresa+documento. Só decisões vivas contam (a query já filtra
    // superseded_at is null), senão cada correção somaria de novo.
    const leadDecisions = decisionsByLead.get(lead.id) ?? [];
    const paidKeys = new Set(
      leadDecisions.filter((decision) => decision.status === "pago").map((decision) => `${decision.empresa}\u0000${decision.documento}`)
    );
    const paidBoletos = parseSnapshotBoletos(snapshot?.metadata ?? null)
      .filter((boleto) => paidKeys.has(`${boleto.empresa}\u0000${boleto.documento}`));
    const column = classifyFinancialHandoff({
      handoffAcceptedAt: lead.handoff_accepted_at ?? null,
      resolution: resolution ? { destination: resolution.destination, recordedAt: resolution.recorded_at, followupStatus: resolution.followup_status } : null,
      openBoletoCount: boletos.length,
      activeDecisions: leadDecisions,
    });
    return [{
      leadId: lead.id,
      name: lead.name,
      phone: lead.wa_phone,
      cobrancaLogId: snapshot?.id ?? null,
      openBoletoCount: boletos.length,
      openAmount: boletos.reduce((sum, boleto) => sum + boleto.valor, 0),
      paidAmount: paidBoletos.reduce((sum, boleto) => sum + boleto.valor, 0),
      paidBoletoCount: paidBoletos.length,
      handoffSentAt: lead.handoff_sent_at ?? null,
      handoffAcceptedAt: lead.handoff_accepted_at ?? null,
      handoffStaffOkAt: lead.handoff_staff_ok_at ?? null,
      // Como este cliente foi parar em atendimento humano. `card` = a Priscila
      // encaminhou e o financeiro recebeu aviso no WhatsApp; `manual` = alguém
      // simplesmente respondeu pelo Chatwoot e o bot calou. Os dois são
      // atendimento humano legítimo, mas só o primeiro gerou mensagem — sem
      // essa distinção a conta entre o board e o WhatsApp nunca fecha.
      origemAtendimento: lead.handoff_accepted_at ? (lead.handoff_sent_at ? ("card" as const) : ("manual" as const)) : null,
      column,
      followupAt: resolution?.followup_at ?? null,
      resolutionId: resolution?.id ?? null,
      n8nStatus: resolution?.n8n_status ?? null,
      boletos,
      activeDecisions: decisionsByLead.get(lead.id) ?? [],
    }];
  }).sort((a, b) => (a.followupAt ?? "9999").localeCompare(b.followupAt ?? "9999"));
}

export async function getLeadDetail(id: string): Promise<LeadDetailResponse | null> {
  const supabase = createAdminClient();
  const { leads, followups, conversations, vendors, cobrancas, quotes, sales } = await fetchCore();
  const lead = leads.find((l) => l.id === id);
  if (!lead) return null;

  const leadConversations = conversations.filter((c) => c.lead_id === id);
  const conversationIds = leadConversations.map((c) => c.id);
  const isCobranca = lead.segment === "COBRANCA";
  const [messagesRes, imagesRes, crmImagesRes, handoffDecisionsRes] = await Promise.all([
    conversationIds.length
      ? supabase.from("messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    lead.wa_phone
      ? supabase.from("generated_images").select("*").eq("phone_number", lead.wa_phone).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // Duas tabelas, dois produtores: generated_images é o que o n8n grava (por
    // telefone) e image_generations é o que o próprio CRM grava (por lead_id).
    // O timeline só lia a primeira, que está vazia, então imagem gerada dentro
    // do CRM nunca aparecia no prontuário do lead.
    supabase.from("image_generations").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    isCobranca
      ? supabase.from("cobranca_handoff_boleto_decisions").select("empresa,documento,status,note,promised_at,recorded_at").eq("lead_id", id).is("superseded_at", null).order("recorded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (imagesRes.error) throw imagesRes.error;
  if (crmImagesRes.error) throw crmImagesRes.error;
  if (handoffDecisionsRes.error) throw handoffDecisionsRes.error;

  const messages = (messagesRes.data ?? []) as MessageRow[];
  const images = (imagesRes.data ?? []) as GeneratedImageRow[];
  const crmImages = (crmImagesRes.data ?? []) as CrmImageRow[];
  const leadFollowups = followups.filter((f) => f.lead_id === id || f.numero_cliente === lead.wa_phone);
  const leadCobrancas = cobrancas.filter((c) => c.telefone === lead.wa_phone);
  const leadQuotes = quotes.filter((q) => q.lead_id === id);
  const leadSales = sales.filter((s) => s.lead_id === id);
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const currentPhoneTail = phoneTail(lead.wa_phone);
  const latestCobranca = currentPhoneTail
    ? cobrancas.find((c) => phoneTail(c.telefone) === currentPhoneTail && parseSnapshotBoletos(c.metadata).length > 0) ?? null
    : null;
  const financialHandoff = isCobranca
    ? {
        eligible: Boolean(lead.handoff_accepted_at),
        handoffStaffOkAt: lead.handoff_staff_ok_at ?? null,
        cobrancaLogId: latestCobranca?.id ?? null,
        boletos: latestCobranca ? parseSnapshotBoletos(latestCobranca.metadata) : [],
        activeDecisions: ((handoffDecisionsRes.data ?? []) as FinancialHandoffDecisionRow[])
          .flatMap((decision) => decision.empresa && decision.documento && decision.status && decision.recorded_at
            ? [{ empresa: decision.empresa, documento: decision.documento, status: decision.status, note: decision.note, promisedAt: decision.promised_at ?? null, recordedAt: decision.recorded_at }]
            : []),
      }
    : null;

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
      title: "Cobranças",
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
    ...crmImages.map((img) => ({
      id: img.id,
      type: "image" as const,
      title: "Imagem gerada no CRM",
      description: img.user_name,
      occurredAt: img.created_at,
      metadata: { url: img.generated_image_url, origem: "crm" },
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
    financialHandoff,
  };
}

export async function getAgentSummary(): Promise<AgentSummaryResponse> {
  return buildAgents(await fetchCore());
}

export function buildAgents(core: CoreData): AgentSummaryResponse {
  const { leads, conversations, vendors } = core;

  // Um lead pertence a UM agente. Antes cada agente contava todo lead cujo
  // segmento aparecesse na sua lista, e os segmentos se sobrepõem — os 6 leads
  // reais viravam 9 espalhados entre Ana Paula, Thiago, Ana Paula Costa e
  // Marcos Vieira, e a soma da aba /agentes não batia com o dashboard.
  // Só agente ativo recebe; entre ativos, o mais antigo do segmento vence.
  const activeVendors = vendors.filter((v) => v.active === true);
  const ownerOf = new Map<string, string>();
  for (const lead of leads) {
    if (!lead.segment) continue;
    const owner = activeVendors.find((v) => (v.segment ?? []).includes(lead.segment!));
    if (owner) ownerOf.set(lead.id, owner.id);
  }

  const agents: AgentSummaryItem[] = vendors.map((vendor) => {
    const segments = vendor.segment ?? [];
    const vendorConversations = conversations.filter((c) => c.vendor_id === vendor.id);
    const segmentLeads = leads.filter((l) => ownerOf.get(l.id) === vendor.id);
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
      chatwootInboxId: vendor.chatwoot_inbox_id ?? null,
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
        tooltip: "Agentes habilitados para operação; não representa online real.",
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

export type LeadConversationsResponse = {
  generatedAt: string;
  leadId: string;
  leadName: string | null;
  leadPhone: string | null;
  conversations: {
    id: string;
    channel: string | null;
    status: string | null;
    startedAt: string | null;
    messages: { id: string; role: "user" | "assistant" | "system"; content: string; createdAt: string | null }[];
  }[];
};

/**
 * O que o agente conversou com aquele número. Usado no atendimento financeiro:
 * antes de baixar um boleto ou devolver ao bot, quem decide precisa ver o que o
 * cliente respondeu — senão a decisão é tomada só pelo valor na tela.
 */
export async function getLeadConversations(leadId: string): Promise<LeadConversationsResponse | null> {
  const supabase = createAdminClient();
  const { leads } = await fetchCore();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return null;

  const { data: conversationsData, error: conversationsError } = await supabase
    .from("conversations")
    .select("id,channel,status,started_at")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false });
  if (conversationsError) throw conversationsError;

  const conversationRows = conversationsData ?? [];
  const conversationIds = conversationRows.map((conversation) => conversation.id);
  const { data: messagesData, error: messagesError } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("id,conversation_id,role,content,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messagesError) throw messagesError;

  return {
    generatedAt: nowIso(),
    leadId: lead.id,
    leadName: lead.name ?? null,
    leadPhone: lead.wa_phone ?? null,
    conversations: conversationRows.map((conversation) => ({
      id: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      startedAt: conversation.started_at,
      messages: (messagesData ?? [])
        .filter((message) => message.conversation_id === conversation.id)
        .map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
          createdAt: message.created_at,
        })),
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

/**
 * O catálogo tem 3.077 linhas nas quatro tabelas e vem de uma carga do ERP —
 * muda algumas vezes por dia, não a cada requisição. Sem isto, o dashboard
 * puxava as 3.077 linhas só para saber se o estoque está sincronizado (ele pede
 * `limit=1`, mas o corte acontece depois da busca), e a tela de estoque
 * refazia tudo a cada tecla digitada na busca, que também é filtrada aqui.
 *
 * Um minuto é bem menor que o intervalo entre cargas do ERP.
 */
const PRODUCTS_TTL_MS = 60_000;
let productsCache: { at: number; rows: Promise<InventoryProduct[]> } | undefined;

async function fetchProducts(): Promise<InventoryProduct[]> {
  const now = Date.now();
  if (productsCache && now - productsCache.at < PRODUCTS_TTL_MS) return productsCache.rows;

  const rows = loadProducts();
  rows.catch(() => { productsCache = undefined; });
  productsCache = { at: now, rows };
  return rows;
}

/** Só aparelho inteiro. O ERP cadastra um split em quatro linhas — o aparelho,
 *  as duas metades (UNID EXT / UNID INT), o PAINEL do cassete e o KIT de
 *  controle remoto. Numa busca por "cassete 24000" o vendedor não quer a moldura. */
const APARELHO_INTEIRO = /^\s*(SPLIT|BISPLIT|TRISPLIT|QUADRISPLIT|ACJ|CJTO|AR)\b/i;

/**
 * Busca no catálogo para o seletor de produto do gerador de imagem.
 *
 * Reaproveita o cache de `fetchProducts` em vez de ir ao banco a cada tecla: são
 * ~3 mil linhas já em memória e o filtro em JS responde na hora, sem somar uma
 * query por caractere digitado.
 *
 * Casa por token, não por substring: "hisense 12000 wifi" precisa achar
 * "SPLIT HI WALL 12000 FRIO HISENSE INVERTER WIFI" mesmo com as palavras fora de
 * ordem. Código do ERP casa por prefixo, que é como o vendedor digita — "0129"
 * traz a família toda.
 */
export async function searchProducts(opts: {
  q: string;
  limit?: number;
  apenasAparelhos?: boolean;
}): Promise<{ products: InventoryProduct[] }> {
  const limite = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const termos = normalizarTokens(opts.q);

  let candidatos = await fetchProducts();
  candidatos = dedupePorProduto(candidatos);
  if (opts.apenasAparelhos) candidatos = candidatos.filter((p) => APARELHO_INTEIRO.test(p.name ?? ""));

  if (!termos.length) {
    // Sem busca, mostra o que dá para vender hoje — lista vazia numa caixa de
    // busca não ensina nada sobre o que existe no catálogo.
    return {
      products: candidatos
        .filter((p) => (p.stock ?? 0) > 0)
        .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
        .slice(0, limite),
    };
  }

  const pontuados = candidatos
    .map((p) => {
      const alvo = normalizarTokens([p.name, p.brand, p.btu, p.category].filter(Boolean).join(" "));
      // `sku` é a máscara (0129C1), que é o que o vendedor lê na tela do ERP;
      // `erpCode` é o idProduto (13261), número interno. Os dois casam por
      // prefixo porque "0129" tem que trazer a família inteira.
      const codigos = [p.sku, p.erpCode].filter(Boolean).map((c) => c!.toLowerCase());
      let pontos = 0;
      for (const t of termos) {
        if (codigos.some((c) => c.startsWith(t))) pontos += 10;
        else if (alvo.includes(t)) pontos += 1;
      }
      return { p, pontos };
    })
    .filter((x) => x.pontos >= termos.length);

  pontuados.sort((a, b) => b.pontos - a.pontos || (b.p.stock ?? 0) - (a.p.stock ?? 0));
  return { products: pontuados.slice(0, limite).map((x) => x.p) };
}

function normalizarTokens(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Seleciona a tabela pedindo `imagem_url` e, se a coluna ainda não existir,
 * repete sem ela.
 *
 * As migrations deste projeto são aplicadas à mão, então existe uma janela em
 * que o código já está na Vercel e o schema não mudou. Sem esta tolerância essa
 * janela derruba o catálogo inteiro e o dashboard junto — o custo de evitar isso
 * é uma segunda query que só acontece durante a janela.
 */
async function selectProdutos(
  supabase: SupabaseClient,
  tabela: string,
  colunas: string
): Promise<{ data: ProductRow[] | null; error: PostgrestError | null }> {
  // O cast passa por `unknown` porque o cliente tipado do Supabase interpreta a
  // string do select em tempo de tipo, e aqui ela só existe em tempo de execução.
  type Resultado = { data: ProductRow[] | null; error: PostgrestError | null };
  // Paginado: `products_reseller` tem mais de 1.000 linhas e o PostgREST corta
  // no milésimo sem avisar — o catálogo e a busca do gerador perdiam o resto.
  const consultar = async (cols: string): Promise<Resultado> => {
    try {
      const data = await selectAllPages<ProductRow>(
        (from, to) =>
          supabase.from(tabela).select(cols).order("nome").order("id").range(from, to) as unknown as PromiseLike<Resultado>
      );
      return { data, error: null };
    } catch (error) {
      return { data: null, error: error as PostgrestError };
    }
  };

  const comImagem = await consultar(`${colunas},imagem_url,sku`);
  // 42703 = undefined_column. Qualquer outro erro é problema de verdade e sobe.
  if (!comImagem.error || comImagem.error.code !== "42703") return comImagem;
  return consultar(colunas);
}

async function loadProducts(): Promise<InventoryProduct[]> {
  const supabase = createAdminClient();
  const [consumerRes, resellerRes, installerRes, builderRes] = await Promise.all([
    selectProdutos(supabase, "products_consumer", "id,codigo_erp,nome,marca,btu,voltagem,preco_venda,estoque"),
    selectProdutos(supabase, "products_reseller", "id,codigo_erp,nome,marca,preco_venda,estoque"),
    selectProdutos(supabase, "products_installer", "id,codigo_erp,nome,categoria,preco_venda,estoque"),
    selectProdutos(supabase, "products_builder_architect", "id,codigo_erp,nome,preco_venda,estoque"),
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
    sku: row.sku ?? null,
    imageUrl: row.imagem_url ?? null,
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
    // Era 50, e o card "Sem estoque" contava o tamanho desta lista — a partir da
    // 51ª solicitação ele travaria em 50 sem avisar ninguém.
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, productName: r.product_name, createdAt: r.created_at }));
}

/**
 * Colapsa as linhas de segmento em um produto do ERP.
 *
 * `codigo_erp` é a identidade real; `id` é da linha, e a mesma geladeira tem uma
 * linha em consumer e outra em reseller para carregar o preço de cada canal.
 * Linha sem `codigo_erp` não tem como ser pareada, então conta sozinha em vez de
 * todas colidirem numa chave só.
 */
function dedupePorProduto<T extends { erpCode: string | null; id: string; source: string }>(rows: T[]): T[] {
  const porChave = new Map<string, T>();
  for (const row of rows) {
    const chave = row.erpCode ?? `linha:${row.source}:${row.id}`;
    if (!porChave.has(chave)) porChave.set(chave, row);
  }
  return [...porChave.values()];
}

/**
 * O que o dashboard pergunta ao estoque: "o ERP já mandou saldo?" e "quantos
 * produtos existem?". Sai de product_metrics() — antes eram quatro varreduras
 * paginadas de `codigo_erp` só para isso.
 */
export function buildInventoryCounts(productMetrics: ProductMetrics): InventorySummaryResponse {
  return {
    generatedAt: nowIso(),
    estoqueSincronizado: productMetrics.sincronizado,
    topDemanda: [],
    metrics: [
      metric({
        id: "total_products",
        label: "Total de produtos",
        value: productMetrics.total_distintos,
        formula: "count(distinct codigo_erp em products_*)",
        period: allTimePeriod(),
        previous: null,
        tooltip: "Produtos distintos do ERP, sem contar duas vezes quem aparece em mais de um segmento.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      }),
    ],
    products: [],
    outOfStockRequests: [],
    breakdowns: { bySource: [], lowStockBySource: [] },
  } as InventorySummaryResponse;
}

const ACTIVITY_PER_SOURCE = 6;
const ACTIVITY_MAX = 15;

const byDateDesc = <T>(date: (row: T) => string | null) => (a: T, b: T) => {
  const da = date(a);
  const db = date(b);
  if (!da) return db ? 1 : 0;
  if (!db) return -1;
  return new Date(db).getTime() - new Date(da).getTime();
};

/**
 * Feed "atividade recente" do dashboard, a partir do núcleo já carregado.
 * Antes o browser montava isso sozinho, com três consultas próprias a cada
 * refresh; a regra é a mesma.
 */
export function buildActivity(core: CoreData): ActivityItem[] {
  const items: ActivityItem[] = [];

  // Busca acima de 6 e só depois tira cobrança: todo disparo de cobrança já cria
  // o lead, então uma fatia dos mais recentes é sempre desse segmento — sem a
  // folga, um dia com só disparos esvaziaria o bloco. Lead de cobrança nasce
  // junto com a linha de cobranca_log; mostrar os dois é o mesmo evento duas vezes.
  const leads = [...core.leads].sort(byDateDesc((l) => l.created_at)).slice(0, ACTIVITY_PER_SOURCE * 2);
  for (const l of leads.filter(ehLeadComercial).slice(0, ACTIVITY_PER_SOURCE)) {
    items.push({ id: l.id, type: "lead", label: l.name ?? "Novo lead", sub: l.segment ?? "", date: l.created_at });
  }

  const cobrancas = [...core.cobrancas].sort(byDateDesc((c) => c.data_disparo)).slice(0, ACTIVITY_PER_SOURCE);
  for (const c of cobrancas) {
    items.push({ id: c.id, type: "cobranca", label: c.nome ?? "Cobrança", sub: c.valor ?? "", date: c.data_disparo });
  }

  const respondidos = core.followups
    .filter((f) => f.respondeu === true)
    .sort(byDateDesc((f) => f.created_at))
    .slice(0, ACTIVITY_PER_SOURCE);
  for (const f of respondidos) {
    items.push({
      id: String(f.id),
      type: "followup",
      label: "Follow-up respondido",
      sub: f.tipo ?? "",
      date: f.ultima_msg_lead ?? f.created_at,
    });
  }

  return items
    .filter((i) => i.date)
    .sort(byDateDesc((i) => i.date))
    .slice(0, ACTIVITY_MAX);
}

const URGENT_AFTER_MS = 48 * 3600 * 1000;

/**
 * Follow-ups urgentes: pendentes (regra única em @/lib/followups) parados há
 * mais de 48h por `updated_at`. Mesma conta de getUrgentFollowupsCount, feita
 * sobre o núcleo em vez de uma consulta a mais.
 */
export function countUrgentFollowups(core: CoreData, now = Date.now()): number {
  const cutoff = now - URGENT_AFTER_MS;
  return core.followups.filter(
    (f) => isFollowupPendente(f) && f.updated_at != null && new Date(f.updated_at).getTime() < cutoff
  ).length;
}

async function getInventoryCounts(): Promise<InventorySummaryResponse> {
  return buildInventoryCounts(await fetchProductMetrics());
}

export async function getInventorySummary(searchParams?: URLSearchParams): Promise<InventorySummaryResponse> {
  if (searchParams?.get("scope") === "summary") return getInventoryCounts();

  const [products, outOfStockRequests, productMetrics] = await Promise.all([
    fetchProducts(),
    fetchOutOfStockRequests(),
    fetchProductMetrics(),
  ]);
  const q = searchParams?.get("search")?.toLowerCase().trim();
  const limit = Math.min(Number(searchParams?.get("limit") ?? 200) || 200, 1000);
  const filtered = products.filter((p) => {
    if (!q) return true;
    return [p.name, p.brand, p.category, p.btu, p.voltage, p.erpCode].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const outOfStock = outOfStockRequests.length;

  // `estoque` nulo é "o ERP não mandou saldo", não zero: "0 produtos com
  // estoque baixo" se lê como "está tudo abastecido", que é o oposto de "não
  // medimos". Enquanto não houver dado, os cards dizem isso.
  // Um produto do ERP tem uma linha por segmento: 1.394 produtos vivem em mais
  // de uma tabela. Contar linhas inflava os cards em 79%. A tabela segue por
  // segmento, que é onde o preço de cada canal aparece; a contagem é por
  // produto e vem de product_metrics() — a mesma fonte das pendências do
  // dashboard, para "Zerados no ERP" e "Produtos sem estoque" nunca divergirem.
  const distintos = dedupePorProduto(products);

  const comEstoqueConhecido = distintos.filter((p) => p.stock != null);
  const estoqueSincronizado = productMetrics.sincronizado;
  const SEM_DADO = "não sincronizado";

  const lowStock = estoqueSincronizado ? productMetrics.estoque_baixo : SEM_DADO;
  const zerados = estoqueSincronizado ? productMetrics.zerados : SEM_DADO;
  const disponivel = estoqueSincronizado
    ? comEstoqueConhecido.filter((p) => p.stock! > 10).length
    : SEM_DADO;

  const topDemanda = agruparDemanda(
    outOfStockRequests,
    products.map((p) => p.brand).filter((m): m is string => Boolean(m)),
  );

  return {
    generatedAt: nowIso(),
    estoqueSincronizado,
    topDemanda,
    metrics: [
      metric({
        id: "total_products",
        label: "Total produtos",
        value: productMetrics.total_distintos,
        formula: "count(distinct codigo_erp em products_*)",
        tooltip:
          "Produtos distintos do ERP. Cada um tem uma linha por segmento comercial, então a tabela abaixo mostra mais linhas do que este número.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      }),
      metric({
        id: "out_of_stock",
        label: "Pedidos não atendidos",
        value: outOfStock,
        formula: "count(out_of_stock_requests)",
        tooltip:
          "Vezes em que o agente não conseguiu atender um pedido — produto que a ARCIL não revende, ou que revende e estava sem estoque.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "out" } },
      }),
      metric({
        id: "erp_zerado",
        label: "Zerados no ERP",
        value: zerados,
        formula: "count(distinct codigo_erp where max(estoque) <= 0)",
        tooltip:
          "Sem saldo nos depósitos de venda (HLB MS, HLB Parana e Londrina PDV). O ERP já desconta as reservas, então zero aqui significa nada disponível para vender.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "out" } },
      }),
      metric({
        id: "low_stock",
        label: "Estoque baixo",
        value: lowStock,
        formula: "count(distinct products where estoque between 1 and 10)",
        tooltip: "Produtos com 1 a 10 unidades somando os três depósitos de venda.",
        drilldown: { href: "/demanda-estoque", filters: { stock: "low" } },
      }),
      metric({
        id: "available",
        label: "Disponível",
        value: disponivel,
        formula: "count(distinct products where estoque > 10)",
        tooltip: "Produtos com mais de 10 unidades disponíveis.",
        drilldown: { href: "/demanda-estoque", filters: {} },
      }),
    ],
    products: filtered.slice(0, limit),
    outOfStockRequests,
    breakdowns: {
      bySource: countBy(products, (p) => p.source),
      // Mesmo critério do card `low_stock`. Antes o card exigia estoque > 0 e
      // este não, então com `estoque` null o card dizia 0 e o breakdown 3.043.
      lowStockBySource: countBy(
        products.filter((p) => p.stock != null && p.stock > 0 && p.stock <= 10),
        (p) => p.source,
      ),
    },
  };
}
