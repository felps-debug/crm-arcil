"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useApi, formatMoney } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { PendingCenterResponse } from "@/types/api";
import "../../../components/operational-wall.css";

interface BillingDetail {
  id: number;
  name: string;
  value: number;
  status: "overdue" | "pending" | "paid";
  daysLate?: number;
  daysToDue?: number;
  details?: {
    document?: string;
    dueDate?: string;
    lastReminder?: string;
    notes?: string;
  };
}

export default function OperacoesCobrancaPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedBill, setSelectedBill] = useState<BillingDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);
    const channel = supabase.channel("cobranca-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const cobranca = useApi<PendingCenterResponse>(`/api/dashboard/pending-center?_r=${refreshTick}`);

  const stats = {
    total: 150,
    pending: 45,
    overdue: 12,
    paid: 93,
  };

  const bills: BillingDetail[] = [
    { id: 1, name: "João Silva", value: 2500, status: "overdue", daysLate: 5, details: { document: "123.456.789-10", dueDate: "05/08/2026", lastReminder: "2 dias atrás" } },
    { id: 2, name: "Maria Santos", value: 1800, status: "pending", daysToDue: 2, details: { document: "987.654.321-00", dueDate: "13/08/2026", lastReminder: "Nunca" } },
    { id: 3, name: "Carlos Oliveira", value: 3200, status: "pending", daysToDue: 7, details: { document: "555.666.777-88", dueDate: "18/08/2026", lastReminder: "1 semana atrás" } },
    { id: 4, name: "Ana Costa", value: 950, status: "overdue", daysLate: 12, details: { document: "111.222.333-44", dueDate: "30/07/2026", lastReminder: "3 dias atrás" } },
    { id: 5, name: "Pedro Lima", value: 4100, status: "pending", daysToDue: 3, details: { document: "444.555.666-77", dueDate: "14/08/2026", lastReminder: "5 dias atrás" } },
  ];

  const billingStatus = [
    { id: "pending", label: "Pendente", count: stats.pending, icon: Clock, color: "var(--op-amber)" },
    { id: "overdue", label: "Vencido", count: stats.overdue, icon: AlertTriangle, color: "var(--op-red)" },
    { id: "paid", label: "Pago", count: stats.paid, icon: CheckCircle2, color: "var(--op-green)" },
  ];

  const openBillDetail = (bill: BillingDetail) => {
    setSelectedBill({
      ...bill,
      details: {
        ...bill.details,
        notes: bill.status === "overdue"
          ? "Cliente com pagamentos atrasados. Aguardando contato urgente."
          : "Boleto enviado via email. Cliente confirmou recebimento."
      }
    });
  };

  const handleAction = async (action: string) => {
    if (!selectedBill) return;
    setActionLoading(true);

    try {
      const webhook = process.env.NEXT_PUBLIC_N8N_COBRANCA_WEBHOOK;
      if (webhook) {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            billId: selectedBill.id,
            billName: selectedBill.name,
            value: selectedBill.value,
            status: selectedBill.status,
            timestamp: new Date().toISOString(),
          }),
        });
      }

      if (action === "pay") {
        alert(`✓ Cobrança de R$ ${formatMoney(selectedBill.value)} marcada como PAGA\n✓ Webhook n8n disparado`);
      } else if (action === "remind") {
        alert(`✓ Lembrete enviado para ${selectedBill.name}\n✓ Webhook n8n disparado`);
      } else if (action === "reschedule") {
        alert(`✓ Vencimento remarcado para 14 dias\n✓ Webhook n8n disparado`);
      }

      setRefreshTick((t) => t + 1);
      setSelectedBill(null);
    } catch (err) {
      alert(`✗ Erro: ${err instanceof Error ? err.message : "Desconhecido"}`);
    } finally {
      setActionLoading(false);
    }
  };

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
            <span className="op-panel-count">{bills.length}</span>
          </div>

          <div className="op-queue-list">
            {bills.map((bill) => (
              <motion.div
                key={bill.id}
                className="op-queue-row"
                data-severity={bill.status === "overdue" ? "danger" : "warning"}
                onClick={() => openBillDetail(bill)}
                style={{ cursor: "pointer" }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
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
          <span className="op-ledger-value" style={{ color: "var(--op-red)" }}>{formatMoney(stats.overdue * 1200)}</span>
        </div>
      </div>

      {/* Bill Detail Modal */}
      <Dialog.Root open={!!selectedBill}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 50,
            }}
            onClick={() => setSelectedBill(null)}
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
                  {selectedBill?.name}
                </Dialog.Title>
              </div>
              <button
                onClick={() => setSelectedBill(null)}
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
              {/* Valor */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Valor
                </p>
                <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--op-cyan)", fontFamily: "IBM Plex Mono" }}>
                  {formatMoney(selectedBill?.value || 0)}
                </p>
              </div>

              {/* Status */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Status
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background:
                        selectedBill?.status === "overdue"
                          ? "var(--op-red)"
                          : selectedBill?.status === "pending"
                            ? "var(--op-amber)"
                            : "var(--op-green)",
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--op-text-primary)" }}>
                    {selectedBill?.status === "overdue"
                      ? `Vencido há ${selectedBill.daysLate} dias`
                      : `Vence em ${selectedBill?.daysToDue} dias`}
                  </span>
                </div>
              </div>

              {/* Documento */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  CPF/CNPJ
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)", fontFamily: "IBM Plex Mono" }}>
                  {selectedBill?.details?.document}
                </p>
              </div>

              {/* Data vencimento */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Data de vencimento
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {selectedBill?.details?.dueDate}
                </p>
              </div>

              {/* Último lembrete */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Último lembrete
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--op-text-primary)" }}>
                  {selectedBill?.details?.lastReminder}
                </p>
              </div>

              {/* Notas */}
              <div>
                <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "var(--op-muted)", textTransform: "uppercase" }}>
                  Notas
                </p>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--op-text-secondary)", lineHeight: 1.5 }}>
                  {selectedBill?.details?.notes}
                </p>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                <button
                  onClick={() => handleAction("pay")}
                  disabled={actionLoading}
                  style={{
                    padding: "10px",
                    background: "var(--op-green)",
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: actionLoading ? "default" : "pointer",
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? "Processando..." : "✓ Marcar como pago"}
                </button>
                <button
                  onClick={() => handleAction("remind")}
                  disabled={actionLoading}
                  style={{
                    padding: "10px",
                    background: "var(--op-amber)",
                    color: "#000",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: actionLoading ? "default" : "pointer",
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? "Processando..." : "📧 Enviar lembrete"}
                </button>
                <button
                  onClick={() => handleAction("reschedule")}
                  disabled={actionLoading}
                  style={{
                    padding: "10px",
                    background: "var(--op-surface)",
                    color: "var(--op-text-primary)",
                    border: "1px solid var(--op-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: actionLoading ? "default" : "pointer",
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? "Processando..." : "Reagendar"}
                </button>
                <button
                  onClick={() => setSelectedBill(null)}
                  style={{
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
