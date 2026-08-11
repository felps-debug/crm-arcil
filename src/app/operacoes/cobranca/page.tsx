"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useApi, formatMoney } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { PendingCenterResponse } from "@/types/api";
import "../../../components/operational-wall.css";

export default function OperacoesCobrancaPage() {
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("cobranca-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const cobranca = useApi<PendingCenterResponse>(`/api/dashboard/pending-center?_r=${refreshTick}`, [refreshTick]);

  const stats = {
    total: 150,
    pending: 45,
    overdue: 12,
    paid: 93,
  };

  const billingStatus = [
    { id: "pending", label: "Pendente", count: stats.pending, icon: Clock, color: "#ffc14c" },
    { id: "overdue", label: "Vencido", count: stats.overdue, icon: AlertTriangle, color: "#ff7465" },
    { id: "paid", label: "Pago", count: stats.paid, icon: CheckCircle2, color: "#70d8a1" },
  ];

  return (
    <div className="operational-wall">
      {/* Header */}
      <header className="op-header">
        <div className="op-header-left">
          <div className="op-headline">
            <h1>Cobranças em operação</h1>
            <p>Fila financeira em tempo real</p>
          </div>
        </div>
        <div className="op-header-right">
          <button className="op-refresh" onClick={() => setRefreshTick((t) => t + 1)}>
            Atualizar
          </button>
        </div>
      </header>

      {/* Status Overview */}
      <section className="op-hero" style={{ margin: "24px 28px" }}>
        <div className="op-hero-copy">
          <div className="op-eyebrow">FINANÇAS</div>
          <p className="op-hero-text">
            {stats.pending} boletos pendentes, {stats.overdue} vencidos. Total de {formatMoney(stats.total * 1200)} em processamento.
          </p>
          <div className="op-hero-signal">
            <span className="op-signal-dot live" />
            Monitoramento contínuo
          </div>
        </div>

        <div className="op-hero-metrics">
          {billingStatus.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.id} className="op-metric-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <Icon size={16} style={{ color: stat.color }} />
                  <div className="op-metric-label">{stat.label}</div>
                </div>
                <div className="op-metric-value">{stat.count}</div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Billing Queue */}
      <div style={{ margin: "0 28px 28px" }}>
        <section className="op-panel" style={{ marginBottom: "16px" }}>
          <div className="op-panel-header">
            <div>
              <p className="op-panel-label">PRÓXIMOS PASSOS</p>
              <h2>Ações financeiras</h2>
            </div>
            <span className="op-panel-count">12</span>
          </div>

          <div className="op-queue-list">
            {[
              { id: 1, name: "João Silva", value: 2500, status: "overdue", daysLate: 5 },
              { id: 2, name: "Maria Santos", value: 1800, status: "pending", daysToDue: 2 },
              { id: 3, name: "Carlos Oliveira", value: 3200, status: "pending", daysToDue: 7 },
              { id: 4, name: "Ana Costa", value: 950, status: "overdue", daysLate: 12 },
              { id: 5, name: "Pedro Lima", value: 4100, status: "pending", daysToDue: 3 },
            ].map((bill) => (
              <motion.div key={bill.id} className="op-queue-row" data-severity={bill.status === "overdue" ? "danger" : "warning"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <div className="op-queue-label">
                  <div style={{ fontSize: "11px", fontWeight: 600 }}>{bill.name}</div>
                  <div style={{ fontSize: "10px", color: "var(--op-muted)", marginTop: "2px" }}>
                    {bill.status === "overdue" ? `${bill.daysLate}d vencido` : `vence em ${bill.daysToDue}d`}
                  </div>
                </div>
                <div className="op-queue-count" style={{ minWidth: "80px", textAlign: "right" }}>
                  {formatMoney(bill.value)}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      {/* Summary Ledger */}
      <div className="op-ledger" style={{ margin: "0 28px 28px" }}>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Total Carteira</span>
          <span className="op-ledger-value">{formatMoney(stats.total * 1200)}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Recebido</span>
          <span className="op-ledger-value">{formatMoney(stats.paid * 1200)}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Em Aberto</span>
          <span className="op-ledger-value">{formatMoney(stats.pending * 1200)}</span>
        </div>
        <div className="op-ledger-cell">
          <span className="op-ledger-label">Risco</span>
          <span className="op-ledger-value" style={{ color: "#ff7465" }}>{formatMoney(stats.overdue * 1200)}</span>
        </div>
      </div>
    </div>
  );
}
