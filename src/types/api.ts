/* API Response Types */

export interface LeadListItem {
  id: string;
  name?: string;
  company?: string;
  phone?: string;
  status: string;
  statusLabel?: string;
  responsible?: string;
  handoffSentAt?: string;
  handoffAcceptedAt?: string;
  awaitingFollowup?: boolean;
  hasConversation?: boolean;
  handoffVendor?: string;
  aiAgent?: string;
  [key: string]: any;
}

export interface LeadsResponse {
  leads?: LeadListItem[];
  items?: LeadListItem[];
  total: number;
}

export interface AgentItem {
  id: string;
  name: string;
  enabled: boolean;
  segment?: string[];
  activeLeads: number;
  conversations: number;
  lostLeads: number;
  waPhone?: string;
  totalLeads?: number;
  chatwootInboxId?: string;
  lastActivityAt?: string;
}

export interface AgentSummaryResponse {
  agents: AgentItem[];
  total: number;
  metrics?: Array<{
    id?: string;
    name?: string;
    label?: string;
    value?: number;
  }>;
}

export interface DashboardSummaryResponse {
  activeLeads: number;
  pendingFollowups: number;
  totalPortfolio: number;
  totalReceived: number;
  atRisk: number;
}

export interface InventorySummaryResponse {
  totalProducts?: number;
  inStock?: number;
  lowStock?: number;
  outOfStock?: number;
  products?: InventoryProduct[];
  topDemanda?: any[];
  outOfStockRequests?: any[];
  estoqueSincronizado?: boolean;
  breakdowns?: any[];
  metrics?: Array<{ id?: string; name?: string; label?: string; value?: number }>;
}

export interface PendingCenterResponse {
  pending: number;
  overdue: number;
  paid: number;
}

export interface ActivityLogResponse {
  logs?: Array<{
    id: string;
    action: string;
    timestamp: string;
    user: string;
    entityType?: string;
    createdAt?: string;
  }>;
  items?: Array<{
    id: string;
    action: string;
    timestamp: string;
    user: string;
    entityType?: string;
    createdAt?: string;
  }>;
}

export interface LeadDetailResponse extends LeadListItem {
  handoffSentAt?: string;
  awaitingFollowup?: boolean;
  hasConversation?: boolean;
  handoffVendor?: string;
  aiAgent?: string;
  segmentLabel?: string;
  lastContactAt?: string;
  awaitingSince?: string;
  financialHandoff?: any;
  lead?: { id: string; [key: string]: any };
}

export interface InventoryProduct {
  id?: string;
  name?: string;
  sku?: string;
  price?: number;
  source?: string;
  quantity?: number;
  estoque?: number;
  grupo?: string;
  marca?: string;
  btu?: number;
  [key: string]: any;
}
