"use client";

import { motion } from "framer-motion";
import { Clock, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { formatNumber, formatMoney } from "@/lib/client-api";
import type { DashboardSummaryResponse, AgentSummaryResponse, PendingCenterResponse, InventorySummaryResponse } from "@/types/api";
import "./operational-wall.css";

/**
 * Lê uma métrica pelo id dentro de `metrics[]`, que é como as rotas do CRM
 * entregam os números.
 *
 * Esta tela nasceu lendo `summary.activeLeads`, `inventory.totalProducts` e
 * afins — campos que nenhuma rota devolve. Compilava porque os tipos estavam
 * afrouxados com `[key: string]: any`, e em produção cada um desses viraria
 * `undefined`, exibindo zero em tudo.
 */
function metricaPorId(
  metrics: { id?: string; value?: number | string }[] | undefined,
  id: string
): number {
  const m = (metrics ?? []).find((x) => x.id === id);
  const bruto = typeof m?.value === "string" ? Number(m.value.replace(/[^\d.-]/g, "")) : m?.value;
  return Number.isFinite(bruto) ? Number(bruto) : 0;
}

interface OperationalWallProps {
  summary?: DashboardSummaryResponse | null;
  agents?: AgentSummaryResponse | null;
  pending?: PendingCenterResponse | null;
  inventory?: InventorySummaryResponse | null;
  realtimeState?: "connected" | "connecting" | "disconnected";
}

export function OperationalWall({
  summary,
  agents,
  pending,
  inventory,
  realtimeState = "connected",
}: OperationalWallProps) {
  const activeAgents = agents?.agents.filter((a) => a.enabled) ?? [];
  const totalConversations = activeAgents.reduce((sum, a) => sum + a.conversations, 0);

  return (
    <div className="operational-wall">
      {/* Header */}
      <header className="op-header">
        <div className="op-header-left">
          <div className="op-headline">
            <h1>Central Operacional</h1>
            <p>Monitoramento em tempo real — ARCIL AC + IA</p>
          </div>
        </div>
        <div className="op-header-right">
          <div className="op-status">
            <span className={`op-signal-dot ${realtimeState}`} />
            <span className="op-status-text">
              {realtimeState === "connected" ? "Conectado" : realtimeState === "connecting" ? "Conectando..." : "Desconectado"}
            </span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="op-hero" style={{ margin: "24px 28px" }}>
        <div className="op-hero-copy">
          <div className="op-eyebrow">
            <Zap size={14} />
            OPERAÇÃO ATIVA
          </div>
          <p className="op-hero-text">
            {activeAgents.length} agentes em operação. {totalConversations} conversas ativas. Processando demanda em tempo real.
          </p>
          <div className="op-hero-signal">
            <span className="op-signal-dot live" />
            Sistema operacional normal
          </div>
        </div>

        <div className="op-hero-metrics">
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Leads Ativos</div>
            <div className="op-metric-value">{formatNumber(metricaPorId(summary?.metrics, "active_leads"))}</div>
          </motion.div>
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Agentes</div>
            <div className="op-metric-value">{activeAgents.length}</div>
          </motion.div>
          <motion.div className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="op-metric-label">Conversas</div>
            <div className="op-metric-value">{formatNumber(totalConversations)}</div>
          </motion.div>
        </div>
      </section>

      {/* Main Grid */}
      <div className="op-main-grid" style={{ margin: "0 28px 28px" }}>
        {/* Agents Panel */}
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">AGENTES</p>
              <h2>Frota ativa</h2>
            </div>
            <span className="op-panel-count">{activeAgents.length}</span>
          </div>
          <div className="op-queue-list">
            {(agents?.agents ?? []).slice(0, 5).map((agent) => (
              <motion.div key={agent.id} className="op-queue-row" data-severity={agent.enabled ? "info" : "paused"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <div className="op-queue-label">
                  <div style={{ fontSize: "11px", fontWeight: 600 }}>{agent.name}</div>
                  <div style={{ fontSize: "10px", color: "var(--op-muted)", marginTop: "2px" }}>
                    {agent.segment?.join(" · ")}
                  </div>
                </div>
                <div className="op-queue-count">{agent.conversations}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Work Queue */}
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">FILA</p>
              <h2>Próximas ações</h2>
            </div>
            <span className="op-panel-count">{metricaPorId(summary?.metrics, "pending_followups")}</span>
          </div>
          <div className="op-queue-list">
            {[
              { id: 1, name: "Proposta instalação", severity: "info", count: 12 },
              { id: 2, name: "Contato recusado", severity: "warning", count: 5 },
              { id: 3, name: "Aguardando retorno", severity: "info", count: 23 },
            ].map((item) => (
              <motion.div key={item.id} className="op-queue-row" data-severity={item.severity} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <div className="op-queue-label">{item.name}</div>
                <div className="op-queue-count">{item.count}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Inventory */}
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">ESTOQUE</p>
              <h2>Produtos</h2>
            </div>
            <span className="op-panel-count">{metricaPorId(inventory?.metrics, "total_products")}</span>
          </div>
          <div className="op-queue-list">
            {[
              { id: 1, name: "Em estoque", severity: "info", count: metricaPorId(inventory?.metrics, "available") },
              { id: 2, name: "Baixo estoque", severity: "warning", count: metricaPorId(inventory?.metrics, "low_stock") },
              { id: 3, name: "Fora de estoque", severity: "danger", count: metricaPorId(inventory?.metrics, "erp_zerado") },
            ].map((item) => (
              <motion.div key={item.id} className="op-queue-row" data-severity={item.severity} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <div className="op-queue-label">{item.name}</div>
                <div className="op-queue-count">{item.count}</div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom Grid */}
      <div className="op-bottom-grid" style={{ margin: "0 28px 28px" }}>
        {/* Events Stream */}
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">EVENTOS</p>
              <h2>Últimas operações</h2>
            </div>
          </div>
          <div className="op-queue-list">
            {[
              { id: 1, event: "Nova oportunidade detectada", time: "2 min atrás" },
              { id: 2, event: "Agente processou conversa", time: "5 min atrás" },
              { id: 3, event: "Imagem gerada com sucesso", time: "12 min atrás" },
            ].map((item) => (
              <motion.div key={item.id} className="op-queue-row" data-severity="info" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <div className="op-queue-label">{item.event}</div>
                <div className="op-queue-count" style={{ fontSize: "10px" }}>{item.time}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Financial Ledger */}
        <section className="op-panel">
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">FINANÇAS</p>
              <h2>Resumo</h2>
            </div>
          </div>
          <div className="op-ledger" style={{ gap: "8px", padding: "12px 0" }}>
            <div className="op-ledger-cell" style={{ minWidth: "auto", flex: 1 }}>
              <span className="op-ledger-label">Carteira</span>
              <span className="op-ledger-value">{formatMoney(metricaPorId(summary?.metrics, "open_collections"))}</span>
            </div>
            <div className="op-ledger-cell" style={{ minWidth: "auto", flex: 1 }}>
              <span className="op-ledger-label">Recebido</span>
              <span className="op-ledger-value" style={{ color: "var(--emerald)" }}>{formatMoney(metricaPorId(summary?.metrics, "received_revenue"))}</span>
            </div>
            <div className="op-ledger-cell" style={{ minWidth: "auto", flex: 1 }}>
              <span className="op-ledger-label">Em risco</span>
              <span className="op-ledger-value" style={{ color: "var(--red)" }}>{formatMoney(metricaPorId(summary?.metrics, "open_collections"))}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
