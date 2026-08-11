/* API Response Types */

export interface LeadListItem {
  id: string;
  name?: string;
  company?: string;
  phone?: string;
  status: string;
  statusLabel?: string;
  responsible?: string;
}

export interface LeadsResponse {
  leads: LeadListItem[];
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
}

export interface AgentSummaryResponse {
  agents: AgentItem[];
  total: number;
}

export interface DashboardSummaryResponse {
  activeLeads: number;
  pendingFollowups: number;
  totalPortfolio: number;
  totalReceived: number;
  atRisk: number;
}

export interface InventorySummaryResponse {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface PendingCenterResponse {
  pending: number;
  overdue: number;
  paid: number;
}
