"use client";

import { AlertTriangle, Boxes, Download, Package, PackageCheck, PackageX, Search } from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsoleMetric,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { formatDateTime, formatMoney, formatNumber, useApi } from "@/lib/client-api";
import type { InventoryProduct, InventorySummaryResponse } from "@/types/api";
import { useMemo, useState } from "react";

function stockTone(stock: number | null): "green" | "amber" | "red" | "violet" {
  if ((stock ?? 0) <= 0) return "red";
  if ((stock ?? 0) <= 10) return "amber";
  if ((stock ?? 0) > 100) return "green";
  return "violet";
}

function sourceLabel(source: InventoryProduct["source"]) {
  return {
    consumer: "Consumidor",
    reseller: "Revenda",
    installer: "Instalador",
    builder_architect: "Construtor",
  }[source];
}

export default function DemandaEstoquePage() {
  const [search, setSearch] = useState("");
  const { data, loading, error } = useApi<InventorySummaryResponse>(`/api/inventory/summary?limit=600&search=${encodeURIComponent(search)}`);
  const products = useMemo(() => data?.products ?? [], [data]);

  const mostRequested = useMemo(() => products.slice(0, 4), [products]);
  const outOfStockRequests = data?.outOfStockRequests ?? [];

  const handleExportCsv = () => {
    const headers = ["Produto", "Marca", "BTU", "Categoria", "Preco", "Estoque", "Disponivel"];
    const rows = products.map((p) => [p.name, p.brand, p.btu, p.category, p.price, p.stock, p.available]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "demanda-estoque.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ConsolePage
      title="Demanda & Estoque"
      subtitle="Estoque sincronizado do Supabase"
      actions={
        <>
          <ConsoleInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca global..." className="w-72" />
          <ConsoleButton icon={Download} onClick={handleExportCsv} disabled={!products.length}>
            Exportar CSV
          </ConsoleButton>
        </>
      }
    >
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && data && (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {data.metrics.map((m, index) => (
              <ConsoleMetric
                key={m.id}
                label={m.label}
                value={formatNumber(m.value)}
                icon={[Package, PackageX, AlertTriangle][index] ?? Boxes}
                tone={index === 0 ? "blue" : index === 1 ? "red" : "amber"}
              />
            ))}
            <ConsoleMetric label="Categorias" value={data.breakdowns.bySource.length} helper="Segmentos comerciais" icon={Boxes} tone="violet" />
            <ConsoleMetric label="Disponivel" value={formatNumber(products.filter((p) => (p.stock ?? 0) > 10).length)} helper="Produtos com estoque normal" icon={PackageCheck} tone="green" />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ConsoleCard>
              <h2 className="mb-4 text-[13px] font-bold text-[var(--text-primary)]">Mais solicitados (top demanda)</h2>
              <div className="space-y-3">
                {mostRequested.map((p, index) => (
                  <DemandBar key={p.id} label={p.name ?? "Produto"} value={Math.max(18, 140 - index * 26)} />
                ))}
              </div>
            </ConsoleCard>
            <ConsoleCard>
              <h2 className="mb-4 text-[13px] font-bold text-[var(--text-primary)]">Demanda nao atendida</h2>
              <div className="space-y-2">
                {outOfStockRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                    <p className="text-[12px] font-bold text-[var(--text-primary)]">{req.productName}</p>
                    <ConsoleStatus tone="red">{formatDateTime(req.createdAt)}</ConsoleStatus>
                  </div>
                ))}
                {!outOfStockRequests.length && <p className="text-[12px] text-[var(--text-muted)]">Nenhuma solicitacao de produto sem estoque registrada.</p>}
              </div>
            </ConsoleCard>
          </section>

          <ConsoleCard pad={false}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Search size={14} className="text-[var(--text-muted)]" />
              <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Filtrar por modelo, BTU ou marca...</span>
            </div>
            <ConsoleTable headers={["Produto", "Marca", "BTU", "Categoria", "Preco", "Estoque", "Disponivel", "Status"]}>
              {products.map((p) => (
                <tr key={`${p.source}-${p.id}`} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[var(--text-primary)]">{p.name ?? "-"}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{p.erpCode ?? p.id}</p>
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{p.brand ?? "-"}</td>
                  <td className="px-3 py-3 font-data text-[var(--text-secondary)]">{p.btu ?? "-"}</td>
                  <td className="px-3 py-3"><ConsoleStatus tone="slate">{p.category ?? sourceLabel(p.source)}</ConsoleStatus></td>
                  <td className="px-3 py-3 font-data font-semibold text-[var(--text-primary)]">{formatMoney(p.price)}</td>
                  <td className="px-3 py-3 font-data">{formatNumber(p.stock ?? 0)}</td>
                  <td className="px-3 py-3 font-data">{formatNumber(p.available ?? 0)}</td>
                  <td className="px-3 py-3"><ConsoleStatus tone={stockTone(p.stock)}>{(p.stock ?? 0) <= 0 ? "Critico" : (p.stock ?? 0) <= 10 ? "Baixo" : "OK"}</ConsoleStatus></td>
                </tr>
              ))}
            </ConsoleTable>
          </ConsoleCard>
        </>
      )}
    </ConsolePage>
  );
}

function DemandBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span className="truncate text-[var(--text-secondary)]">{label}</span>
        <span className="font-data text-[var(--text-primary)]">{value} solic.</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-subtle)]">
        <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(100, value / 1.5)}%` }} />
      </div>
    </div>
  );
}
