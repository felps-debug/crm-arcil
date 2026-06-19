/* ================================================================
   ARCIL CRM — Types mapeados às tabelas reais do Supabase
   ================================================================ */

/* ── Enums ──────────────────────────────────────────────────────── */

export type LeadStatus = "ACTIVE" | "LOST" | "IN_PROGRESS";

export type LeadSegment =
  | "NEW"
  | "CONSUMER"
  | "BUILDER"
  | "INSTALLER"
  | "RESELLER"
  | "COBRANCA";

export type ChannelOrigin = "OUTBOUND" | "WHATSAPP";

/* ── Leads ──────────────────────────────────────────────────────── */

export interface Lead {
  id: string;
  wa_phone: string | null;
  name: string | null;
  company: string | null;
  region: string | null;
  city: string | null;
  channel_origin: ChannelOrigin | null;
  segment: LeadSegment | null;
  status: LeadStatus | null;
  lead_score: number | null;
  chatwoot_contact_id: string | null;
  is_recurring_defaulter: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

/* ── Conversations ──────────────────────────────────────────────── */

export interface Conversation {
  id: string;
  lead_id: string | null;
  session_id: string | null;
  channel: string | null;
  intent: string | null;
  summary: string | null;
  status: string | null;
  vendor_id: string | null;
  started_at: string | null;
  ended_at: string | null;
}

/* ── Messages ───────────────────────────────────────────────────── */

export interface Message {
  id: string;
  conversation_id: string | null;
  role: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

/* ── Follow-ups ─────────────────────────────────────────────────── */

export interface Followup {
  id: number;
  lead_id: string | null;
  nome_cliente: string | null;
  numero_cliente: string | null;
  produto_negociado: string | null;
  preco_ofertado: number | null;
  motivo_nao_converteu: string | null;
  quote_id: string | null;
  ultima_msg_ia: string | null;
  ultima_msg_lead: string | null;
  followup_step: number | null;
  followup_sent: boolean | null;
  respondeu: boolean | null;
  status: string | null;
  tipo: "lead" | "cobranca" | null;
  created_at: string | null;
}

/* ── Cobrança Log ───────────────────────────────────────────────── */

export interface CobrancaLog {
  id: string;
  telefone: string;
  nome: string | null;
  valor: string | null;
  vencimento: string | null;
  documento: string | null;
  reminder_stage: string | null;
  status_disparo: "PENDENTE" | "DISPARADO" | string;
  respondeu: boolean;
  pagamento_confirmado: boolean;
  data_disparo: string | null;
  created_at: string | null;
  /** Linha completa da planilha do ERP usada no disparo (todas as colunas originais). */
  metadata: Record<string, string> | null;
}

/* ── Activity Log ───────────────────────────────────────────────── */

export interface ActivityLog {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  action: string | null;
  metadata: Record<string, unknown> | null;
  wf_origin: string | null;
  created_at: string | null;
}

/* ── Products Cache (ERP Net1) ──────────────────────────────────── */

export interface Product {
  id: string;
  erp_id: string | null;
  name: string | null;
  category: string | null;
  categoria_nome: string | null;
  price: number | null;
  preco_revenda: number | null;
  stock_qty: number | null;
  specs: Record<string, unknown> | null;
  synced_at: string | null;
}

/* ── Vendors ───────────────────────────────────────────────────── */

export interface Vendor {
  id: string;
  name: string | null;
  segment: string[] | null;
  chatwoot_agent_id: string | null;
  wa_phone: string | null;
  active: boolean | null;
  created_at: string | null;
}

/* ── Label Maps ─────────────────────────────────────────────────── */

export const SEGMENT_LABELS: Record<LeadSegment, string> = {
  NEW: "Novo",
  CONSUMER: "Consumidor",
  BUILDER: "Construtor",
  INSTALLER: "Instalador",
  RESELLER: "Revenda",
  COBRANCA: "Cobrança",
};

export const CHANNEL_LABELS: Record<ChannelOrigin, string> = {
  OUTBOUND: "Outbound",
  WHATSAPP: "WhatsApp",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  ACTIVE: "Ativo",
  LOST: "Perdido",
  IN_PROGRESS: "Em Progresso",
};
