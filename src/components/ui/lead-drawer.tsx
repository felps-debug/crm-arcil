"use client";

import { useEffect, useState } from "react";
import { X, MessageCircle, Phone, Clock, Building2, MapPin, BarChart3, Calendar, Hash, Pencil, Save, XCircle } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadSegment, LeadStatus, ChannelOrigin } from "@/types";
import { SEGMENT_LABELS, CHANNEL_LABELS } from "@/types";
import { getInitials } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "danger" | "warning" | "outline" }> = {
  ACTIVE:      { label: "Ativo",        variant: "success" },
  LOST:        { label: "Perdido",      variant: "danger"  },
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

interface LeadDrawerProps {
  lead: Lead | null;
  onClose: () => void;
  onUpdate?: (lead: Lead) => void;
}

export function LeadDrawer({ lead, onClose, onUpdate }: LeadDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", wa_phone: "", city: "", region: "", status: "", segment: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setForm({
        name:     lead.name     ?? "",
        company:  lead.company  ?? "",
        wa_phone: lead.wa_phone ?? "",
        city:     lead.city     ?? "",
        region:   lead.region   ?? "",
        status:   lead.status   ?? "",
        segment:  lead.segment  ?? "",
      });
      setEditing(false);
      setSaveError(null);
    }
  }, [lead]);

  async function handleSave() {
    if (!lead) return;
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("leads")
      .update({
        name:     form.name     || null,
        company:  form.company  || null,
        wa_phone: form.wa_phone || null,
        city:     form.city     || null,
        region:   form.region   || null,
        status:   (form.status  as LeadStatus)  || null,
        segment:  (form.segment as LeadSegment) || null,
      })
      .eq("id", lead.id)
      .select()
      .single();
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    onUpdate?.(data as Lead);
    setEditing(false);
  }

  const displayStatus = editing ? form.status : (lead?.status ?? "");
  const s = lead
    ? (STATUS_CFG[displayStatus] ?? { label: displayStatus || "—", variant: "outline" as const })
    : null;

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-blue-500/10 transition-all";
  const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block";

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
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[var(--bg-surface)] z-50 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalhes de ${lead.name ?? "lead"}`}
          >
            <div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-sky-400" />

            {/* Header */}
            <div className="px-7 py-6 border-b border-[var(--border)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
                  >
                    <span className="text-white text-sm font-bold">
                      {getInitials((editing ? form.name : lead.name) ?? "?")}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-extrabold text-[var(--text-primary)] text-xl tracking-tight leading-tight">
                      {editing ? (form.name || "Sem nome") : (lead.name ?? "Sem nome")}
                    </h2>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5 tabular-nums">
                      {editing ? (form.wa_phone || "Sem telefone") : (lead.wa_phone ?? "Sem telefone")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Fechar detalhes"
                  className="p-2 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Badge variant={s.variant} dot>{s.label}</Badge>
                {(editing ? form.segment : lead.segment) && (
                  <Badge variant="violet">
                    {SEGMENT_LABELS[(editing ? form.segment : lead.segment) as LeadSegment] ?? (editing ? form.segment : lead.segment)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {!editing ? (
                <>
                  <div className="px-7 py-5 border-b border-[var(--border)] flex gap-3">
                    {lead.wa_phone && (
                      <a href={`https://wa.me/${lead.wa_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button size="sm" className="w-full shadow-md">
                          <MessageCircle size={15} />WhatsApp
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="secondary" className="flex-1">
                      <Phone size={15} />Ligar
                    </Button>
                  </div>

                  <div className="px-7 py-6 border-b border-[var(--border)]">
                    <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5">Detalhes</h3>
                    <div className="grid grid-cols-2 gap-5">
                      {[
                        { icon: Building2, label: "Empresa",    value: lead.company ?? "—" },
                        { icon: MapPin,    label: "Região",     value: lead.region  ?? "—" },
                        { icon: Hash,      label: "Canal",      value: lead.channel_origin ? (CHANNEL_LABELS[lead.channel_origin as ChannelOrigin] ?? lead.channel_origin) : "—" },
                        { icon: BarChart3, label: "Lead Score", value: String(lead.lead_score ?? 0) },
                        { icon: Calendar,  label: "Criado em",  value: lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—" },
                        { icon: Clock,     label: "Atualizado", value: formatRelative(lead.updated_at) },
                      ].map(({ icon: Ic, label, value }) => (
                        <div key={label} className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-[var(--bg-subtle)] rounded-xl ring-1 ring-[var(--border)] flex items-center justify-center mt-0.5 shrink-0">
                            <Ic size={14} className="text-[var(--text-muted)]" />
                          </div>
                          <div>
                            <p className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">{label}</p>
                            <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-7 py-6">
                    <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5">Lead Score</h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-5 bg-[var(--bg-subtle)] rounded-full overflow-hidden shadow-inner">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(lead.lead_score ?? 0, 100)}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg, #2563eb, #1d4ed8)" }}
                          />
                        </div>
                      </div>
                      <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums w-14 text-right">
                        {lead.lead_score ?? 0}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-7 py-6 space-y-4">
                  <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Editar Lead</h3>

                  <div>
                    <label className={labelCls}>Nome</label>
                    <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do lead" />
                  </div>

                  <div>
                    <label className={labelCls}>Empresa</label>
                    <input className={inputCls} value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Empresa" />
                  </div>

                  <div>
                    <label className={labelCls}>WhatsApp</label>
                    <input className={inputCls} value={form.wa_phone} onChange={(e) => setForm((f) => ({ ...f, wa_phone: e.target.value }))} placeholder="5511..." />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Cidade</label>
                      <input className={inputCls} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Cidade" />
                    </div>
                    <div>
                      <label className={labelCls}>Região</label>
                      <input className={inputCls} value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="Região" />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Status</label>
                    <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      <option value="">— selecionar —</option>
                      <option value="ACTIVE">Ativo</option>
                      <option value="IN_PROGRESS">Em Progresso</option>
                      <option value="LOST">Perdido</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>Segmento</label>
                    <select className={inputCls} value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}>
                      <option value="">— selecionar —</option>
                      <option value="NEW">Novo</option>
                      <option value="CONSUMER">Consumidor</option>
                      <option value="INSTALLER">Instalador</option>
                      <option value="BUILDER">Construtor</option>
                      <option value="RESELLER">Revenda</option>
                      <option value="COBRANCA">Cobrança</option>
                    </select>
                  </div>

                  {saveError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 text-[12px] text-red-500">
                      <XCircle size={13} /> {saveError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-7 py-5 border-t border-[var(--border)] flex gap-2">
              {!editing ? (
                <>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={onClose}>
                    Fechar
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => setEditing(true)}>
                    <Pencil size={14} /> Editar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" size="sm" className="flex-1" disabled={saving} onClick={() => { setEditing(false); setSaveError(null); }}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="flex-1" disabled={saving} onClick={handleSave}>
                    {saving ? <span className="inline-block animate-spin">⟳</span> : <Save size={14} />}
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
