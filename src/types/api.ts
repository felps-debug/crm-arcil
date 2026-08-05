export type ApiDrilldown = {
  href: string;
  filters: Record<string, string>;
};

export type ApiPeriod = {
  label: string;
  from: string | null;
  to: string | null;
};

export type ApiComparison = {
  label: string;
  value: number | string | null;
  deltaPercent: number | null;
};

export type ApiMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  formula: string;
  period: ApiPeriod;
  previous: ApiComparison;
  tooltip: string;
  drilldown: ApiDrilldown;
};

export type ApiBreakdownItem = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

export type DashboardSummaryResponse = {
  generatedAt: string;
  period: ApiPeriod;
  metrics: ApiMetric[];
  commercialFunnel: ApiBreakdownItem[];
  commercialIndicators: ApiMetric[];
  /** Leads criados por dia no período, dias vazios inclusos com 0. */
  leadsPerDay: { date: string; value: number }[];
  breakdowns: {
    leadsByStatus: ApiBreakdownItem[];
    leadsBySegment: ApiBreakdownItem[];
    leadsByCity: ApiBreakdownItem[];
    leadsByOrigin: ApiBreakdownItem[];
    salesByVendor: ApiBreakdownItem[];
  };
};

export type PendingSeverity = "info" | "warning" | "danger";

export type PendingItem = {
  id: string;
  label: string;
  count: number;
  severity: PendingSeverity;
  formula: string;
  period: ApiPeriod;
  tooltip: string;
  drilldown: ApiDrilldown;
};

export type PendingCenterResponse = {
  generatedAt: string;
  items: PendingItem[];
};

export type LeadListItem = {
  id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  segment: string | null;
  segmentLabel: string;
  status: string | null;
  statusLabel: string;
  origin: string | null;
  responsible: string | null;
  aiAgent: string | null;
  hasConversation: boolean;
  /** True only when a followup was actually dispatched (followups.followup_sent)
   * and the lead hasn't answered it. A followups row exists from the moment the
   * lead is created, so its mere presence means nothing. */
  awaitingFollowup: boolean;
  leadScore: number | null;
  lastContactAt: string | null;
  nextActionAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeadsResponse = {
  generatedAt: string;
  total: number;
  filters: Record<string, string | null>;
  items: LeadListItem[];
};

export type LeadTimelineItem = {
  id: string;
  type: "lead" | "conversation" | "message" | "followup" | "collection" | "image" | "quote" | "sale";
  title: string;
  description: string | null;
  occurredAt: string | null;
  metadata?: Record<string, unknown>;
};

export type LeadDetailResponse = {
  generatedAt: string;
  lead: LeadListItem;
  summary: {
    conversations: number;
    messages: number;
    followups: number;
    collections: number;
    generatedImages: number;
    quotes: number;
    sales: number;
  };
  nextAction: LeadTimelineItem | null;
  timeline: LeadTimelineItem[];
};

export type AgentSummaryItem = {
  id: string;
  name: string;
  segment: string[];
  enabled: boolean;
  status: "enabled" | "disabled" | "online_unknown";
  waPhone: string | null;
  totalLeads: number;
  activeLeads: number;
  lostLeads: number;
  conversations: number;
  lastActivityAt: string | null;
};

export type AgentSummaryResponse = {
  generatedAt: string;
  metrics: ApiMetric[];
  agents: AgentSummaryItem[];
};

export type AgentConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | null;
};

export type AgentConversationItem = {
  id: string;
  leadName: string | null;
  leadPhone: string | null;
  channel: string | null;
  status: string | null;
  startedAt: string | null;
  messages: AgentConversationMessage[];
};

export type AgentConversationsResponse = {
  generatedAt: string;
  agentId: string;
  agentName: string;
  conversations: AgentConversationItem[];
};

export type ActivityLogItem = {
  id: string;
  entityType: string;
  action: string;
  wfOrigin: string | null;
  createdAt: string;
};

export type ActivityLogResponse = {
  items: ActivityLogItem[];
};

export type InventoryProduct = {
  id: string;
  source: "consumer" | "reseller" | "installer" | "builder_architect";
  name: string | null;
  brand: string | null;
  category: string | null;
  btu: string | null;
  voltage: string | null;
  price: number | null;
  stock: number | null;
  available: number | null;
  erpCode: string | null;
};

export type OutOfStockRequest = {
  id: string;
  productName: string;
  createdAt: string;
};

export type InventorySummaryResponse = {
  generatedAt: string;
  metrics: ApiMetric[];
  products: InventoryProduct[];
  outOfStockRequests: OutOfStockRequest[];
  breakdowns: {
    bySource: ApiBreakdownItem[];
    lowStockBySource: ApiBreakdownItem[];
  };
};
