"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Kanban, List, Grid2X2, ChevronRight, X, Search } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useApi } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { LeadListItem, LeadsResponse } from "@/types/api";
import "../../../components/operational-wall.css";

interface DetailLead extends LeadListItem {
  details?: {
    lastContact?: string;
    nextFollowup?: string;
    notes?: string;
    value?: number;
  };
}

export default function OperacoesLeadsPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [viewMode, setViewMode] = useState<"kanban" | "table" | "cards">("kanban");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<DetailLead | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const leads = useApi<LeadsResponse>(`/api/leads?_r=${refreshTick}`);

  const stages = [
    { id: "NOVO", label: "Novo", color: "var(--op-amber)" },
    { id: "CONVERSANDO", label: "Conversando", color: "var(--op-green)" },
    { id: "FOLLOWUP", label: "Follow-up", color: "var(--op-amber)" },
    { id: "ENCAMINHADO", label: "Encaminhado", color: "var(--op-green)" },
    { id: "PERDIDO", label: "Perdido", color: "var(--op-red)" },
  ];

  const filteredLeads = (leads.data?.items ?? []).filter((lead) => {
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    const matchesSearch = !searchTerm ||
      lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openDetail = (lead: LeadListItem) => {
    setSelectedLead({
      ...lead,
      details: {
        lastContact: "2 horas atrás",
        nextFollowup: "Amanhã às 14h",
        notes: "Cliente interessado em modelo split high wall. Aguardando aprovação de orçamento.",
        value: 12500,
      },
    });
  };

  return (
    <div className="operational-wall">
      {/* Header */}
      <header className="op-header">
        <div className="op-header-left">
          <div className="op-headline">
            <h1>Leads em operação</h1>
            <p>Pipeline em tempo real</p>
          </div>
        </div>
        <div className="op-header-right">
          <div className="view-controls">
            <button onClick={() => setViewMode("kanban")} data-active={viewMode === "kanban"}>
              <Kanban size={16} />
            </button>
            <button onClick={() => setViewMode("table")} data-active={viewMode === "table"}>
              <List size={16} />
            </button>
            <button onClick={() => setViewMode("cards")} data-active={viewMode === "cards"}>
              <Grid2X2 size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div style={{ margin: "16px 28px", display: "flex", gap: "12px", alignItems: "center" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "var(--op-surface)",
          border: "1px solid var(--op-border)",
          borderRadius: "6px",
          flex: 1,
          maxWidth: "400px"
        }}>
          <Search size={14} style={{ color: "var(--op-muted)" }} />
          <input
            type="text"
            placeholder="Buscar por nome ou empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "var(--op-text-primary)",
              fontSize: "12px",
              outline: "none",
            }}
          />
        </div>

        <select
          value={statusFilter || ""}
          onChange={(e) => setStatusFilter(e.target.value || null)}
          style={{
            padding: "8px 12px",
            background: "var(--op-surface)",
            border: "1px solid var(--op-border)",
            borderRadius: "6px",
            color: "var(--op-text-primary)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <option value="">Todos os status</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.label} ({filteredLeads.filter(l => l.status === stage.id).length})
            </option>
          ))}
        </select>

        <div style={{ fontSize: "11px", color: "var(--op-muted)" }}>
          {filteredLeads.length} leads
        </div>
      </div>

      {/* Main Content */}
      {leads.loading ? (
        <div className="op-loading">
          <div className="op-spinner" />
        </div>
      ) : (
        <div className="op-leads-container">
          {viewMode === "kanban" && (
            <div className="op-kanban">
              {stages.map((stage) => (
                <motion.div key={stage.id} className="op-kanban-column" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="op-kanban-header" style={{ borderTopColor: stage.color }}>
                    <h3>{stage.label}</h3>
                    <span>{filteredLeads.filter((l) => l.status === stage.id).length}</span>
                  </div>
                  <div className="op-kanban-cards">
                    {filteredLeads
                      .filter((l) => l.status === stage.id)
                      .map((lead) => (
                        <motion.div
                          key={lead.id}
                          className="op-lead-card"
                          onClick={() => openDetail(lead)}
                          style={{ cursor: "pointer" }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="op-lead-name">{lead.name || "—"}</div>
                          <div className="op-lead-meta">
                            <span className="op-lead-company">{lead.company}</span>
                            <span className="op-lead-phone">{lead.phone}</span>
                          </div>
                          <div className="op-lead-action">
                            Ver <ChevronRight size={12} />
                          </div>
                        </motion.div>
                      ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div className="op-leads-table">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Empresa</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const stage = stages.find(s => s.id === lead.status);
                    return (
                      <tr key={lead.id} onClick={() => openDetail(lead)} style={{ cursor: "pointer" }}>
                        <td>{lead.name}</td>
                        <td>{lead.company}</td>
                        <td style={{ fontFamily: "IBM Plex Mono" }}>{lead.phone}</td>
                        <td>
                          <span
                            className="op-badge"
                            style={{
                              background: stage?.color || "var(--op-blue)",
                              color: "#000"
                            }}
                          >
                            {stage?.label}
                          </span>
                        </td>
                        <td><button style={{ cursor: "pointer", background: "none", border: "none", color: "var(--op-blue)" }}>Abrir →</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Lead Detail Modal */}
      <Dialog.Root open={!!selectedLead}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 50,
            }}
            onClick={() => setSelectedLead(null)}
          />
          <Dialog.Content
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              background: "var(--op-surface)",
              border: "1px solid var(--op-border)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "500px",
              width: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: 51,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "20px" }}>
              <div>
                <Dialog.Title style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--op-text-primary)" }}>
                  {selectedLead?.name}
                </Dialog.Title>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--op-muted)" }}>
                  {selectedLead?.company}
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--op-text-secondary)",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              {/* Contato */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Contato
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)", fontFamily: "IBM Plex Mono" }}>
                  {selectedLead?.phone}
                </p>
              </div>

              {/* Status */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Status
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {stages.find(s => s.id === selectedLead?.status)?.label}
                </p>
              </div>

              {/* Último contato */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Último contato
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {selectedLead?.details?.lastContact}
                </p>
              </div>

              {/* Próximo follow-up */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Próximo follow-up
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {selectedLead?.details?.nextFollowup}
                </p>
              </div>

              {/* Valor */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Valor estimado
                </p>
                <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--op-cyan)", fontFamily: "IBM Plex Mono" }}>
                  R$ {selectedLead?.details?.value?.toLocaleString("pt-BR")}
                </p>
              </div>

              {/* Notas */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Notas
                </p>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--op-text-secondary)", lineHeight: 1.5 }}>
                  {selectedLead?.details?.notes}
                </p>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  onClick={() => setSelectedLead(null)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "var(--op-blue)",
                    color: "var(--op-cabinet)",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Enviar proposta
                </button>
                <button
                  onClick={() => setSelectedLead(null)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "var(--op-surface)",
                    color: "var(--op-text-primary)",
                    border: "1px solid var(--op-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
