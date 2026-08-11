"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, TrendingUp } from "lucide-react";
import { useApi, formatNumber } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { AgentSummaryResponse } from "@/types/api";
import "../../../components/operational-wall.css";

export default function OperacoesAgentesPage() {
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("agents-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary?_r=${refreshTick}`, [refreshTick]);

  const activeAgents = agents.data?.agents.filter((a) => a.enabled) ?? [];
  const totalConversations = activeAgents.reduce((sum, a) => sum + a.conversations, 0);
  const totalActiveLeads = activeAgents.reduce((sum, a) => sum + a.activeLeads, 0);

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
                <motion.div key={agent.id} className="op-agent-card" data-active={agent.enabled} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
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
          <span className="op-ledger-value" style={{ color: "#70d8a1" }}>
            {totalActiveLeads + (agents.data?.agents.reduce((s, a) => s + a.lostLeads, 0) ?? 0) > 0
              ? Math.round((totalActiveLeads / (totalActiveLeads + (agents.data?.agents.reduce((s, a) => s + a.lostLeads, 0) ?? 0))) * 100)
              : 0}%
          </span>
        </div>
      </div>

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
