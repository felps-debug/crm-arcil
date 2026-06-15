"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { MetricCard } from "@/components/ui/metric-card";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useSupabase } from "@/hooks/use-supabase";
import { getAgentStats } from "@/lib/supabase/queries";
import {
  Bot, Users, UserCheck, Wrench, Building2, Store,
  ShoppingBag, RotateCcw, ChevronRight, TrendingUp,
} from "lucide-react";

const AGENT_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
  bg: string;
  accent: string;
}> = {
  INSTALLER: {
    label: "Instalador",
    description: "Técnicos e instaladores de AC",
    icon: Wrench,
    color: "text-blue-600",
    bg: "bg-blue-500/8",
    accent: "#2563eb",
  },
  BUILDER: {
    label: "Construtor",
    description: "Construtoras e empreiteiras",
    icon: Building2,
    color: "text-emerald-600",
    bg: "bg-emerald-500/8",
    accent: "#059669",
  },
  RESELLER: {
    label: "Revenda",
    description: "Revendas e distribuidores",
    icon: Store,
    color: "text-violet-600",
    bg: "bg-violet-500/8",
    accent: "#7c3aed",
  },
  CONSUMER: {
    label: "Consumidor",
    description: "Pessoa física — consumidor final",
    icon: ShoppingBag,
    color: "text-amber-600",
    bg: "bg-amber-500/8",
    accent: "#d97706",
  },
  NEW: {
    label: "Roteadora",
    description: "Classifica e roteia novos leads",
    icon: RotateCcw,
    color: "text-sky-600",
    bg: "bg-sky-500/8",
    accent: "#0284c7",
  },
};

function AgentCard({
  segment, total, active, converted, index,
}: { segment: string; total: number; active: number; converted: number; index: number }) {
  const router = useRouter();
  const cfg = AGENT_CONFIG[segment] ?? AGENT_CONFIG.NEW;
  const Icon = cfg.icon;
  const rate = total > 0 ? ((converted / total) * 100).toFixed(0) : "0";
  const activeRate = total > 0 ? ((active / total) * 100).toFixed(0) : "0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.06 }}
      onClick={() => router.push(`/agentes/${segment.toLowerCase()}`)}
      className="group relative cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] transition-all duration-250"
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-5 right-5 h-px rounded-full opacity-60"
        style={{ background: cfg.accent }}
      />

      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${cfg.bg} flex items-center justify-center`}>
          <Icon size={20} className={cfg.color} strokeWidth={1.8} />
        </div>
        <ChevronRight
          size={16}
          className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all"
        />
      </div>

      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight">{cfg.label}</h3>
      <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{cfg.description}</p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <div>
          <p className="font-data text-[20px] font-bold text-[var(--text-primary)] leading-none">{total}</p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1">Total</p>
        </div>
        <div>
          <p className="font-data text-[20px] font-bold leading-none" style={{ color: cfg.accent }}>{active}</p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1">Ativos</p>
        </div>
        <div>
          <div className="flex items-baseline gap-0.5">
            <p className="font-data text-[20px] font-bold text-[var(--text-primary)] leading-none">{rate}</p>
            <span className="text-[11px] text-[var(--text-muted)]">%</span>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1">Conv.</p>
        </div>
      </div>

      {/* Active progress bar */}
      <div className="mt-4">
        <div className="h-1 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${activeRate}%`, background: cfg.accent, opacity: 0.6 }}
          />
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">{activeRate}% do total ativos</p>
      </div>
    </motion.div>
  );
}

export default function AgentesPage() {
  const { data: stats, loading, error, refetch } = useSupabase(() => getAgentStats(), []);

  const totalLeads  = stats?.reduce((s, r) => s + r.total,  0) ?? 0;
  const totalActive = stats?.reduce((s, r) => s + r.active, 0) ?? 0;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Agentes IA" subtitle="Clique em um agente para ver os detalhes" />

      <main className="flex-1 overflow-y-auto px-6 py-6 max-w-[1440px] mx-auto w-full space-y-8">
        {/* Summary */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : error ? (
            <div className="col-span-3"><ErrorState message={error} onRetry={refetch} /></div>
          ) : (
            <>
              <MetricCard label="Agentes Ativos"  value="5"              icon={Bot}       accent="blue"    />
              <MetricCard label="Leads Totais"    value={String(totalLeads)}  icon={Users}     accent="emerald" />
              <MetricCard label="Leads Ativos"    value={String(totalActive)} icon={UserCheck} accent="violet"  />
            </>
          )}
        </section>

        {/* Agent cards */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <TrendingUp size={14} className="text-[var(--text-muted)]" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Agentes por segmento</h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />)}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {stats?.map((s, i) => <AgentCard key={s.segment} {...s} index={i} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
