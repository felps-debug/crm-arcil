"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Kanban, List, Grid2X2, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { LeadListItem, LeadsResponse } from "@/types/api";
import "../../../components/operational-wall.css";

export default function OperacoesLeadsPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [viewMode, setViewMode] = useState<"kanban" | "table" | "cards">("kanban");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const leads = useApi<LeadsResponse>(`/api/leads?_r=${refreshTick}`, [refreshTick]);

  const stages = [
    { id: "NOVO", label: "Novo", color: "#ffc14c" },
    { id: "CONVERSANDO", label: "Conversando", color: "#70d8a1" },
    { id: "FOLLOWUP", label: "Follow-up", color: "#ffc14c" },
    { id: "ENCAMINHADO", label: "Encaminhado", color: "#70d8a1" },
    { id: "PERDIDO", label: "Perdido", color: "#ff7465" },
  ];

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
                    <span>{(leads.data?.leads ?? []).filter((l) => l.status === stage.id).length}</span>
                  </div>
                  <div className="op-kanban-cards">
                    {(leads.data?.leads ?? [])
                      .filter((l) => l.status === stage.id)
                      .map((lead) => (
                        <motion.div key={lead.id} className="op-lead-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
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
                    <th>Status</th>
                    <th>Responsável</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(leads.data?.leads ?? []).map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>{lead.company}</td>
                      <td><span className="op-badge">{lead.statusLabel}</span></td>
                      <td>{lead.responsible || "—"}</td>
                      <td><button>Ver →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
