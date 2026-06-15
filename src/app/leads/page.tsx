"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LeadDrawer } from "@/components/ui/lead-drawer";
import { useSupabase } from "@/hooks/use-supabase";
import { getActiveLeads, getLeads, subscribeToLeads } from "@/lib/supabase/queries";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/types";
import type { Lead, LeadSegment, LeadStatus } from "@/types";
import { Users, Search, Eye, EyeOff, Phone, Building2, MapPin, RefreshCw } from "lucide-react";
import { getInitials } from "@/lib/utils";

const STATUS_BADGE: Record<LeadStatus, "success" | "danger" | "warning"> = {
  ACTIVE:      "success",
  LOST:        "danger",
  IN_PROGRESS: "warning",
};

const SEGMENT_TABS: { key: string; label: string }[] = [
  { key: "",          label: "Todos"      },
  { key: "NEW",       label: "Novos"      },
  { key: "CONSUMER",  label: "Consumidor" },
  { key: "INSTALLER", label: "Instalador" },
  { key: "BUILDER",   label: "Construtor" },
  { key: "RESELLER",  label: "Revenda"    },
  { key: "COBRANCA",  label: "Cobrança"   },
];

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const name = lead.name ?? "Sem nome";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        {/* Monochrome avatar */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[var(--text-muted)] text-[11px] font-semibold bg-[var(--bg-subtle)] border border-[var(--border)]">
          {getInitials(name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate leading-tight">{name}</p>
            {lead.status && (
              <Badge variant={STATUS_BADGE[lead.status as LeadStatus] ?? "default"} className="shrink-0 text-[10px]">
                {STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
              </Badge>
            )}
          </div>

          {lead.company && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building2 size={10} className="text-[var(--text-muted)] shrink-0" />
              <p className="text-[11.5px] text-[var(--text-muted)] truncate">{lead.company}</p>
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-3 flex-wrap">
        {lead.wa_phone && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Phone size={10} />
            {lead.wa_phone}
          </span>
        )}
        {(lead.city ?? lead.region) && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <MapPin size={10} />
            {lead.city ?? lead.region}
          </span>
        )}
        {lead.segment && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)]">
            {SEGMENT_LABELS[lead.segment as LeadSegment] ?? lead.segment}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl animate-shimmer shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 rounded-full animate-shimmer w-3/4" />
          <div className="h-3 rounded-full animate-shimmer w-1/2" />
        </div>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <div className="flex gap-2">
        <div className="h-3 rounded-full animate-shimmer w-24" />
        <div className="h-3 rounded-full animate-shimmer w-16 ml-auto" />
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [showLegacy,    setShowLegacy]    = useState(false);
  const [segmentFilter, setSegmentFilter] = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [search,        setSearch]        = useState("");
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null);
  const [lastUpdated,   setLastUpdated]   = useState<Date>(new Date());

  const { data: activeLeads, loading: loadingActive, error: errorActive, refetch: refetchActive } =
    useSupabase(() => getActiveLeads(), []);

  const { data: allLeads, loading: loadingAll, error: errorAll, refetch: refetchAll } =
    useSupabase(() => getLeads(), []);

  const baseLeads = showLegacy ? allLeads : activeLeads;
  const loading   = showLegacy ? loadingAll  : loadingActive;
  const error     = showLegacy ? errorAll    : errorActive;

  function refetchAll_() {
    refetchActive();
    refetchAll();
    setLastUpdated(new Date());
  }

  /* ── Supabase Realtime auto-refresh ────────────────────────────── */
  const refetchActiveRef = useRef(refetchActive);
  const refetchAllRef    = useRef(refetchAll);
  refetchActiveRef.current = refetchActive;
  refetchAllRef.current    = refetchAll;

  useEffect(() => {
    const channel = subscribeToLeads(() => {
      refetchActiveRef.current();
      refetchAllRef.current();
      setLastUpdated(new Date());
    });

    const fallback = setInterval(() => {
      refetchActiveRef.current();
      if (showLegacy) refetchAllRef.current();
      setLastUpdated(new Date());
    }, 60_000);

    return () => {
      channel.unsubscribe();
      clearInterval(fallback);
    };
  }, [showLegacy]);

  const filteredLeads = useMemo(() => {
    if (!baseLeads) return [];
    return baseLeads.filter((lead) => {
      if (segmentFilter && lead.segment !== segmentFilter) return false;
      if (statusFilter  && lead.status  !== statusFilter)  return false;
      if (search) {
        const q = search.toLowerCase();
        if (!lead.name?.toLowerCase().includes(q) &&
            !lead.wa_phone?.includes(q) &&
            !lead.company?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [baseLeads, segmentFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    if (segmentFilter) return { [segmentFilter]: filteredLeads };
    const map: Record<string, Lead[]> = {};
    for (const l of filteredLeads) {
      const key = l.segment ?? "OTHER";
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    return map;
  }, [filteredLeads, segmentFilter]);

  const totalCount = filteredLeads.length;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <Header
        title="Leads"
        subtitle={`${totalCount} lead${totalCount !== 1 ? "s" : ""}${showLegacy ? "" : " ativos"}`}
      />

      {/* ── Segment tabs ──────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 sm:px-6 pt-4 max-w-[1440px] mx-auto w-full"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1 overflow-x-auto pb-0 no-scrollbar">
          {SEGMENT_TABS.map(({ key, label }) => {
            const active = segmentFilter === key;
            const segLeads = !loading && baseLeads
              ? baseLeads.filter((l) => key === "" || l.segment === key).length
              : null;
            return (
              <button
                key={key}
                onClick={() => setSegmentFilter(key)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none ${
                  active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {label}
                {segLeads !== null && (
                  <span className={`text-[10px] font-semibold tabular-nums ${active ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                    {segLeads}
                  </span>
                )}
                {active && (
                  <motion.div
                    layoutId="segment-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                    style={{ background: "var(--blue)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search + controls ─────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 pt-3 pb-0 max-w-[1440px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Nome, telefone ou empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-[13px] bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-blue-500/10 transition-all shadow-[var(--shadow-xs)]"
            />
          </div>

          {/* Status filter pills */}
          <div className="hidden sm:flex items-center gap-1.5">
            {(["", "ACTIVE", "IN_PROGRESS", "LOST"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  statusFilter === key
                    ? "bg-[var(--blue)] text-white"
                    : "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                {key ? STATUS_LABELS[key] : "Todos status"}
              </button>
            ))}
          </div>

          {/* Auto-refresh indicator + manual refresh */}
          <button
            onClick={refetchAll_}
            title={`Última atualização: ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-all shadow-[var(--shadow-xs)] border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={() => setShowLegacy(!showLegacy)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-[13px] font-medium transition-all shadow-[var(--shadow-xs)] border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            title={showLegacy ? "Mostrar apenas ativos" : "Mostrar todos incluindo legado"}
          >
            {showLegacy ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">{showLegacy ? "Com legado" : "Sem legado"}</span>
          </button>
        </div>
      </div>

      {/* ── Lead grid ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 pt-4 max-w-[1440px] mx-auto w-full">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetchAll_} />
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shadow-[var(--shadow-sm)]">
              <Users size={24} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--text-muted)]">Nenhum lead encontrado</p>
            {(segmentFilter || statusFilter || search) && (
              <button
                onClick={() => { setSearch(""); setSegmentFilter(""); setStatusFilter(""); }}
                className="text-[13px] text-[var(--blue)] hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([segment, leads]) => (
              <section key={segment}>
                {!segmentFilter && (
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {SEGMENT_LABELS[segment as LeadSegment] ?? segment}
                    </h2>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">{leads.length}</span>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {leads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                    ))}
                  </div>
                </AnimatePresence>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
