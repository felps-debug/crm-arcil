/* ================================================================
   ARCIL CRM — Queries Supabase (client-side)
   ================================================================ */

import { createClient } from "./client";
import type { Lead, Followup, CobrancaLog, Product, Vendor } from "@/types";

const supabase = createClient();

// Projection — excludes heavy metadata/JSON blobs not needed in list views
const LEAD_FIELDS = "id,name,wa_phone,company,city,region,segment,status,lead_score,channel_origin,created_at,updated_at";

/* ── Date Range helper ──────────────────────────────────────────── */

export interface QueryDateRange {
  from?: string;
  to?: string;
}

function applyDateFilter<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  dateCol: string,
  dr?: QueryDateRange
): T {
  if (!dr) return query;
  if (dr.from) query = query.gte(dateCol, dr.from);
  if (dr.to) query = query.lte(dateCol, dr.to);
  return query;
}

/* ── LEADS ──────────────────────────────────────────────────────── */

export async function getLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Lead[];
}

export async function getActiveLeads(filters?: { segment?: string; status?: string; limit?: number }) {
  let q = supabase
    .from("leads")
    .select(LEAD_FIELDS)
    .or("channel_origin.neq.OUTBOUND,segment.eq.COBRANCA")
    .order("created_at", { ascending: false });

  if (filters?.segment) q = q.eq("segment", filters.segment);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.limit) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data as Lead[];
}

export async function getLeadsBySearch(query: string): Promise<Lead[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_FIELDS)
    .or(`name.ilike.%${query}%,wa_phone.ilike.%${query}%,company.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return [];
  return data as Lead[];
}

export async function getLeadById(id: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Lead;
}

export async function getLeadsCount() {
  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/* ── FOLLOWUPS ──────────────────────────────────────────────────── */

export async function getFollowups() {
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Followup[];
}

export async function getFollowupsByType(tipo: "lead" | "cobranca") {
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("tipo", tipo)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Followup[];
}

export async function getPendingFollowups(dr?: QueryDateRange) {
  let q = supabase
    .from("followups")
    .select("*")
    .eq("respondeu", false)
    .order("created_at", { ascending: true });
  q = applyDateFilter(q, "created_at", dr);
  const { data, error } = await q;
  if (error) throw error;
  return data as Followup[];
}

export async function getFollowupsByLead(leadId: string) {
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Followup[];
}

/* ── COBRANÇA ───────────────────────────────────────────────────── */

export async function getCobrancaLog(dr?: QueryDateRange) {
  let q = supabase
    .from("cobranca_log")
    .select("*")
    .order("data_disparo", { ascending: false });
  q = applyDateFilter(q, "data_disparo", dr);
  const { data, error } = await q;
  if (error) throw error;
  return data as CobrancaLog[];
}

export async function getCobrancaStats() {
  const { data, error } = await supabase
    .from("cobranca_log")
    .select("status_disparo, respondeu, pagamento_confirmado");
  if (error) throw error;
  const logs = data ?? [];
  return {
    total: logs.length,
    pendentes: logs.filter((l) => l.status_disparo === "PENDENTE").length,
    disparados: logs.filter((l) => l.status_disparo === "DISPARADO").length,
    responderam: logs.filter((l) => l.respondeu).length,
    pagos: logs.filter((l) => l.pagamento_confirmado).length,
  };
}

/* ── DASHBOARD STATS ────────────────────────────────────────────── */

export async function getDashboardStats() {
  const [
    { count: totalLeads },
    { count: leadsAtivos },
    { count: cobrancasPendentes },
    { count: followupsTotal },
    { count: followupsRespondidos },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true })
      .or("channel_origin.neq.OUTBOUND,segment.eq.COBRANCA"),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .or("channel_origin.neq.OUTBOUND,segment.eq.COBRANCA")
      .eq("status", "ACTIVE"),
    supabase.from("cobranca_log").select("*", { count: "exact", head: true })
      .eq("status_disparo", "PENDENTE"),
    supabase.from("followups").select("*", { count: "exact", head: true }),
    supabase.from("followups").select("*", { count: "exact", head: true })
      .eq("respondeu", true),
  ]);

  const total = totalLeads ?? 0;
  const respondidos = followupsRespondidos ?? 0;
  const totalFu = followupsTotal ?? 0;

  return {
    totalLeads: total,
    leadsAtivos: leadsAtivos ?? 0,
    cobrancasPendentes: cobrancasPendentes ?? 0,
    followupsRespondidos: respondidos,
    taxaResposta: totalFu > 0 ? ((respondidos / totalFu) * 100).toFixed(1) : "0",
  };
}

/* ── LEADS TREND (monthly, exclui legado) ──────────────────────── */

export async function getLeadsTrend() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data, error } = await supabase
    .from("leads")
    .select("created_at")
    .or("channel_origin.neq.OUTBOUND,segment.eq.COBRANCA")
    .gte("created_at", sixMonthsAgo.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;

  const monthMap: Record<string, number> = {};
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  for (const lead of data ?? []) {
    if (!lead.created_at) continue;
    const d = new Date(lead.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    monthMap[key] = (monthMap[key] ?? 0) + 1;
  }

  const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  return sorted.map(([key, count]) => {
    const month = parseInt(key.split("-")[1]);
    return { month: monthNames[month], count };
  });
}

/* ── DEMANDA & ESTOQUE ─────────────────────────────────────────── */

export async function getProducts() {
  const { data, error } = await supabase
    .from("products_cache")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Product[];
}

export async function getLowStockProducts(threshold = 10) {
  const { data, error } = await supabase
    .from("products_cache")
    .select("*")
    .lt("stock_qty", threshold)
    .order("stock_qty", { ascending: true });
  if (error) throw error;
  return data as Product[];
}

export async function getProductStats() {
  const { data, error } = await supabase
    .from("products_cache")
    .select("stock_qty, category, categoria_nome");
  if (error) throw error;
  const products = data ?? [];
  const totalProducts = products.length;
  const outOfStock = products.filter(p => (p.stock_qty ?? 0) === 0).length;
  const lowStock = products.filter(p => (p.stock_qty ?? 0) > 0 && (p.stock_qty ?? 0) <= 10).length;

  const categories: Record<string, number> = {};
  for (const p of products) {
    const cat = p.categoria_nome ?? p.category ?? "Sem categoria";
    categories[cat] = (categories[cat] ?? 0) + 1;
  }

  return { totalProducts, outOfStock, lowStock, categories };
}

export async function getVendors() {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Vendor[];
}

/* ── AGENTES IA ────────────────────────────────────────────────── */

export async function getAgentStats() {
  const segments = ["INSTALLER", "BUILDER", "RESELLER", "CONSUMER", "NEW"] as const;

  // 1 query instead of 15 — fetch segment+status only, aggregate client-side
  const { data, error } = await supabase
    .from("leads")
    .select("segment,status")
    .in("segment", [...segments]);

  if (error) throw error;
  const rows = data ?? [];

  return segments.map((seg) => {
    const segRows = rows.filter((r) => r.segment === seg);
    return {
      segment: seg,
      total: segRows.length,
      active: segRows.filter((r) => r.status === "ACTIVE").length,
      converted: segRows.filter((r) => r.status === "IN_PROGRESS").length,
    };
  });
}

export async function getRecentConversations(limit = 20) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getConversationMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ── REALTIME ───────────────────────────────────────────────────── */

export function subscribeToLeads(callback: (payload: unknown) => void) {
  return supabase
    .channel("leads-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, callback)
    .subscribe();
}

export function subscribeToFollowups(callback: (payload: unknown) => void) {
  return supabase
    .channel("followups-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, callback)
    .subscribe();
}

