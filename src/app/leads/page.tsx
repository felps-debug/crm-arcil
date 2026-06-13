"use client";

import { useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LeadDrawer } from "@/components/ui/lead-drawer";
import { useSupabase } from "@/hooks/use-supabase";
import { getActiveLeads, getLeads } from "@/lib/supabase/queries";
import { SEGMENT_LABELS, STATUS_LABELS, CHANNEL_LABELS } from "@/types";
import type { Lead, LeadSegment, LeadStatus, ChannelOrigin } from "@/types";
import { Users, Search, Eye, EyeOff } from "lucide-react";
import { getInitials } from "@/lib/utils";

const STATUS_BADGE: Record<LeadStatus, "success" | "danger" | "warning"> = {
  ACTIVE: "success",
  LOST: "danger",
  IN_PROGRESS: "warning",
};

export default function LeadsPage() {
  const [showLegacy, setShowLegacy] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { data: activeLeads, loading: loadingActive, error: errorActive, refetch: refetchActive } =
    useSupabase(() => getActiveLeads(), []);

  const { data: allLeads, loading: loadingAll, error: errorAll, refetch: refetchAll } =
    useSupabase(() => getLeads(), []);

  const baseLeads = showLegacy ? allLeads : activeLeads;
  const loading = showLegacy ? loadingAll : loadingActive;
  const error = showLegacy ? errorAll : errorActive;
  const refetch = showLegacy ? refetchAll : refetchActive;

  const filteredLeads = useMemo(() => {
    if (!baseLeads) return [];
    return baseLeads.filter((lead) => {
      if (segmentFilter && lead.segment !== segmentFilter) return false;
      if (statusFilter && lead.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = lead.name?.toLowerCase().includes(q);
        const matchPhone = lead.wa_phone?.includes(q);
        const matchCompany = lead.company?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchCompany) return false;
      }
      return true;
    });
  }, [baseLeads, segmentFilter, statusFilter, search]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
      <Header title="Leads" subtitle="Gestão de leads ARCIL" />

      <main className="px-6 py-8 space-y-6 max-w-[1440px] mx-auto">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border text-[14px] bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
              />
            </div>

            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border text-[13px] bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] focus:outline-none focus:border-blue-400"
            >
              <option value="">Todos segmentos</option>
              {(Object.entries(SEGMENT_LABELS) as [LeadSegment, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border text-[13px] bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] focus:outline-none focus:border-blue-400"
            >
              <option value="">Todos status</option>
              {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            <button
              onClick={() => setShowLegacy(!showLegacy)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-[13px] font-medium transition-all"
              style={{
                borderColor: showLegacy ? "var(--blue)" : "var(--border)",
                color: showLegacy ? "var(--blue)" : "var(--text-muted)",
                background: showLegacy ? "rgba(37,99,235,0.05)" : "transparent",
              }}
            >
              {showLegacy ? <Eye size={14} /> : <EyeOff size={14} />}
              {showLegacy ? "Legado visível" : "Legado oculto"}
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users size={16} className="text-blue-600" />
                </div>
                <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
                  {showLegacy ? "Todos os Leads" : "Leads Ativos"}
                </h2>
              </div>
              {filteredLeads.length > 0 && (
                <Badge variant="default">{filteredLeads.length} leads</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : error ? (
              <div className="p-5">
                <ErrorState message={error} onRetry={refetch} />
              </div>
            ) : filteredLeads.length === 0 ? (
              <p className="text-[14px] text-center py-12" style={{ color: "var(--text-muted)" }}>
                Nenhum lead encontrado
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Nome", "Telefone", "Segmento", "Status", "Canal", "Cidade", "Criado em"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="cursor-pointer"
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                 style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}>
                              <span className="text-white text-[10px] font-bold">
                                {getInitials(lead.name ?? "?")}
                              </span>
                            </div>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {lead.name ?? "Sem nome"}
                            </span>
                          </div>
                        </td>
                        <td className="text-[var(--text-secondary)] tabular-nums">
                          {lead.wa_phone ?? "—"}
                        </td>
                        <td>
                          {lead.segment ? (
                            <Badge variant={lead.segment === "COBRANCA" ? "warning" : "info"}>
                              {SEGMENT_LABELS[lead.segment as LeadSegment] ?? lead.segment}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td>
                          {lead.status ? (
                            <Badge variant={STATUS_BADGE[lead.status as LeadStatus] ?? "default"}>
                              {STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="text-[var(--text-secondary)]">
                          {lead.channel_origin ? CHANNEL_LABELS[lead.channel_origin as ChannelOrigin] ?? lead.channel_origin : "—"}
                        </td>
                        <td className="text-[var(--text-secondary)]">
                          {lead.city ?? lead.region ?? "—"}
                        </td>
                        <td className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
