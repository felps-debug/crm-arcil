"use client";

import { X, MessageCircle, Phone, Clock, Building2, MapPin, BarChart3, Calendar, Hash } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { motion, AnimatePresence } from "framer-motion";
import type { Lead } from "@/types";
import { SEGMENT_LABELS, CHANNEL_LABELS } from "@/types";
import type { LeadSegment, ChannelOrigin } from "@/types";
import { getInitials } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "danger" | "warning" | "outline" }> = {
  ACTIVE: { label: "Ativo", variant: "success" },
  LOST: { label: "Perdido", variant: "danger" },
  IN_PROGRESS: { label: "Em Progresso", variant: "warning" },
};

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

export function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const s = lead ? (STATUS_CFG[lead.status ?? ""] ?? { label: lead.status ?? "—", variant: "outline" as const }) : null;

  return (
    <AnimatePresence>
      {lead && s && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[3px] z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
          >
            {/* Gradient top bar */}
            <div className="h-1.5 bg-gradient-to-r from-blue-500 via-violet-500 to-cyan-500" />

            <div className="px-7 py-6 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                    <span className="text-white text-[14px] font-bold">
                      {getInitials(lead.name ?? "?")}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-extrabold text-slate-900 text-xl tracking-tight">{lead.name ?? "Sem nome"}</h2>
                    <p className="text-[15px] text-slate-500 mt-0.5 tabular-nums">{lead.wa_phone ?? "Sem telefone"}</p>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Fechar detalhes" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  <X size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Badge variant={s.variant} dot>{s.label}</Badge>
                {lead.segment && (
                  <Badge variant="violet">
                    {SEGMENT_LABELS[lead.segment as LeadSegment] ?? lead.segment}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-7 py-5 border-b border-slate-100 flex gap-3">
                {lead.wa_phone && (
                  <a
                    href={`https://wa.me/${lead.wa_phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button size="sm" className="w-full shadow-md">
                      <MessageCircle size={15} />WhatsApp
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="secondary" className="flex-1"><Phone size={15} />Ligar</Button>
              </div>

              <div className="px-7 py-6 border-b border-slate-100">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">Detalhes</h3>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { icon: Building2, label: "Empresa", value: lead.company ?? "—" },
                    { icon: MapPin, label: "Região", value: lead.region ?? "—" },
                    { icon: Hash, label: "Canal", value: lead.channel_origin ? (CHANNEL_LABELS[lead.channel_origin as ChannelOrigin] ?? lead.channel_origin) : "—" },
                    { icon: BarChart3, label: "Lead Score", value: String(lead.lead_score ?? 0) },
                    { icon: Calendar, label: "Criado em", value: lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—" },
                    { icon: Clock, label: "Atualizado", value: formatRelative(lead.updated_at) },
                  ].map(({ icon: Ic, label, value }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div className="w-9 h-9 bg-slate-50 rounded-xl ring-1 ring-slate-100 flex items-center justify-center mt-0.5">
                        <Ic size={14} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
                        <p className="text-[14px] font-bold text-slate-800 mt-0.5">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-7 py-6">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">Lead Score</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(lead.lead_score ?? 0, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, #2563eb, #7c3aed)" }}
                      />
                    </div>
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 tabular-nums w-14 text-right">
                    {lead.lead_score ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-7 py-5 border-t border-slate-100 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
