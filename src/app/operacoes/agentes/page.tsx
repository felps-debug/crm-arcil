"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, TrendingUp, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useApi, formatNumber } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { AgentSummaryResponse } from "@/types/api";
import "../../../components/operational-wall.css";

interface AgentDetail {
  id: string;
  name: string;
  enabled: boolean;
  segment?: string[];
  activeLeads: number;
  conversations: number;
  lostLeads: number;
  details?: {
    uptime: string;
    avgResponseTime: string;
    satisfactionRate: number;
    recentConversations: Array<{
      id: string;
      leadName: string;
      duration: string;
      status: string;
    }>;
  };
}

export default function OperacoesAgentesPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("agents-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary?_r=${refreshTick}`);

  const activeAgents = agents.data?.agents.filter((a) => a.enabled) ?? [];
  const totalConversations = activeAgents.reduce((sum, a) => sum + a.conversations, 0);
  const totalActiveLeads = activeAgents.reduce((sum, a) => sum + a.activeLeads, 0);

  const openAgentDetail = (agent: any) => {
    setSelectedAgent({
      ...agent,
      details: {
        uptime: "99.8%",
        avgResponseTime: "2.3s",
        satisfactionRate: 94,
        recentConversations: [
          { id: "1", leadName: "João Silva", duration: "5m 32s", status: "Ativo" },
          { id: "2", leadName: "Maria Santos", duration: "3m 15s", status: "Finalizado" },
          { id: "3", leadName: "Carlos Oliveira", duration: "7m 48s", status: "Ativo" },
        ],
      },
    });
  };

  return (
    <div className="operational-wall">
      {/* Header */}
      <header className="op-header">
        <div className="op-header-left">
          <div className="op-headline">
            <h1>Frota de IA em operação</h1>
            <p>Monitoramento de agentes por segmento</p>
          </div>
        </div>
        <div className="op-header-right">
          <button className="op-refresh" onClick={() => setRefreshTick((t) => t + 1)}>
            Atualizar
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="op-hero" style={{ margin: "24px 28px" }}>
        <div className="op-hero-copy">
          <div className="op-eyebrow">
            <Zap size={14} />
            INTELIGÊNCIA ARTIFICIAL
          </div>
          <p className="op-hero-text">
            {activeAgents.length} agentes ativos operando em {agents.data?.agents.length ?? 0} segmentos. Processando {totalConversations} conversas.
          </p>
          <div className="op-hero-signal">
            <span className="op-signal-dot live" />
            Sistema em operação normal
          </div>
        </div>

        <div className="op-hero-metrics">
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Agentes Ativos</div>
            <div className="op-metric-value">{activeAgents.length}</div>
          </motion.div>
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Conversas</div>
            <div className="op-metric-value">{formatNumber(totalConversations)}</div>
          </motion.div>
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Leads Processando</div>
            <div className="op-metric-value">{formatNumber(totalActiveLeads)}</div>
          </motion.div>
        </div>
      </section>

      {/* Agents Grid */}
      <div style={{ margin: "0 28px 28px" }}>
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">FROTA</p>
              <h2>Status dos agentes</h2>
            </div>
            <span className="op-panel-count">{agents.data?.agents.length ?? 0}</span>
          </div>

          <div className="op-agents-grid">
            {agents.loading ? (
              <div className="op-loading">
                <div className="op-spinner" />
              </div>
            ) : (
              (agents.data?.agents ?? []).map((agent) => (
                <motion.div
                  key={agent.id}
                  className="op-agent-card"
                  data-active={agent.enabled}
                  onClick={() => openAgentDetail(agent)}
                  style={{ cursor: "pointer" }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="op-agent-header">
                    <div className={`op-agent-signal ${agent.enabled ? "active" : "inactive"}`} />
                    <div className="op-agent-info">
                      <h3>{agent.name}</h3>
                      <p>{agent.segment?.join(" · ") || "—"}</p>
                    </div>
                    <span className="op-agent-status">{agent.enabled ? "ATIVO" : "PAUSADO"}</span>
                  </div>

                  <div className="op-agent-metrics-grid">
                    <div className="metric">
                      <span className="label">Leads Ativos</span>
                      <span className="value">{agent.activeLeads}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Conversas</span>
                      <span className="value">{agent.conversations}</span>
                    </div>
                    <div className="metric">
                      <span className="label">Perdidos</span>
                      <span className="value">{agent.lostLeads}</span>
                    </div>
                  </div>

                  <div className="op-agent-footer">
                    <span className="op-chart">
                      <TrendingUp size={12} /> Taxa: {Math.round((agent.activeLeads / (agent.activeLeads + agent.lostLeads)) * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Summary */}
      <div className="op-ledger" style={{ margin: "0 28px 28px" }}>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Agentes Totais</span>
          <span className="op-ledger-value">{agents.data?.agents.length ?? 0}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Ativos Agora</span>
          <span className="op-ledger-value">{activeAgents.length}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Total de Conversas</span>
          <span className="op-ledger-value">{formatNumber(totalConversations)}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Taxa de Conversão</span>
          <span className="op-ledger-value" style={{ color: "var(--op-green)" }}>
            {totalActiveLeads + (agents.data?.agents.reduce((s, a) => s + a.lostLeads, 0) ?? 0) > 0
              ? Math.round((totalActiveLeads / (totalActiveLeads + (agents.data?.agents.reduce((s, a) => s + a.lostLeads, 0) ?? 0))) * 100)
              : 0}%
          </span>
        </div>
      </div>

      {/* Agent Detail Modal */}
      <Dialog.Root open={!!selectedAgent}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 50,
            }}
            onClick={() => setSelectedAgent(null)}
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
              maxWidth: "600px",
              width: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              zIndex: 51,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "20px" }}>
              <div>
                <Dialog.Title style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--op-text-primary)" }}>
                  {selectedAgent?.name}
                </Dialog.Title>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--op-muted)" }}>
                  {selectedAgent?.segment?.join(" • ")}
                </p>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
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
              {/* Status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                    Status
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div className={`op-agent-signal ${selectedAgent?.enabled ? "active" : "inactive"}`} />
                    <span style={{ fontSize: "13px", color: "var(--op-text-primary)" }}>
                      {selectedAgent?.enabled ? "Operando" : "Pausado"}
                    </span>
                  </div>
                </div>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                    Uptime
                  </p>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                    {selectedAgent?.details?.uptime}
                  </p>
                </div>
              </div>

              {/* Métricas */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                    Leads Ativos
                  </p>
                  <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--op-blue)", fontFamily: "IBM Plex Mono" }}>
                    {selectedAgent?.activeLeads}
                  </p>
                </div>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                    Conversas
                  </p>
                  <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--op-blue)", fontFamily: "IBM Plex Mono" }}>
                    {selectedAgent?.conversations}
                  </p>
                </div>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                    Taxa Conversão
                  </p>
                  <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--op-green)", fontFamily: "IBM Plex Mono" }}>
                    {Math.round((selectedAgent?.activeLeads ?? 0 / ((selectedAgent?.activeLeads ?? 0) + (selectedAgent?.lostLeads ?? 0))) * 100)}%
                  </p>
                </div>
              </div>

              {/* Tempo resposta */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Tempo médio de resposta
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {selectedAgent?.details?.avgResponseTime}
                </p>
              </div>

              {/* Satisfação */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Taxa de satisfação
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    flex: 1,
                    height: "6px",
                    background: "var(--op-border)",
                    borderRadius: "3px",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      width: `${selectedAgent?.details?.satisfactionRate}%`,
                      height: "100%",
                      background: "var(--op-green)"
                    }} />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--op-green)" }}>
                    {selectedAgent?.details?.satisfactionRate}%
                  </span>
                </div>
              </div>

              {/* Conversas recentes */}
              <div>
                <p style={{ margin: "0 0 12px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Conversas recentes
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedAgent?.details?.recentConversations.map((conv) => (
                    <div
                      key={conv.id}
                      style={{
                        padding: "10px",
                        background: "var(--op-inset)",
                        border: "1px solid var(--op-border)",
                        borderRadius: "4px",
                        fontSize: "12px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "var(--op-text-primary)", fontWeight: 600 }}>{conv.leadName}</span>
                        <span style={{ color: "var(--op-muted)", fontSize: "10px" }}>{conv.duration}</span>
                      </div>
                      <span style={{ color: "var(--op-muted)" }}>Status: {conv.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  onClick={() => setSelectedAgent(null)}
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
                  {selectedAgent?.enabled ? "Pausar" : "Ativar"}
                </button>
                <button
                  onClick={() => setSelectedAgent(null)}
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

      <style>{`
        .op-agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          padding: 16px 20px;
          overflow-y: auto;
        }

        .op-agent-card {
          padding: 16px;
          border: 1px solid var(--op-border);
          border-radius: 8px;
          background: var(--op-inset);
          transition: all 0.2s ease;
        }

        .op-agent-card:hover {
          border-color: var(--op-blue);
          background: var(--op-surface);
        }

        .op-agent-card[data-active="false"] {
          opacity: 0.5;
        }

        .op-agent-header {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 14px;
        }

        .op-agent-info {
          flex: 1;
        }

        .op-agent-info h3 {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: var(--op-ivory);
        }

        .op-agent-info p {
          margin: 4px 0 0;
          font-size: 9px;
          color: var(--op-muted);
        }

        .op-agent-status {
          font-size: 8px;
          font-weight: 700;
          color: var(--op-muted);
        }

        .op-agent-metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--op-border);
          border-radius: 4px;
          margin-bottom: 10px;
          overflow: hidden;
        }

        .metric {
          padding: 8px;
          background: var(--op-inset);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }

        .metric .label {
          font-size: 8px;
          color: var(--op-muted);
        }

        .metric .value {
          font-size: 13px;
          font-weight: 700;
          color: var(--op-blue);
        }

        .op-agent-footer {
          display: flex;
          justify-content: center;
        }

        .op-chart {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          color: var(--op-queue-text);
        }
      `}</style>
    </div>
  );
}
