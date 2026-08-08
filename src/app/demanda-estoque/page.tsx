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
import { AccessGuard } from "@/components/layout/access-guard";
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

/** Por id, não por posição no array: acrescentar uma métrica no meio da lista
 *  trocava o ícone e a cor de todas as seguintes. */
const METRIC_ICON: Record<string, typeof Package> = {
  total_products: Package,
  out_of_stock: PackageX,
  erp_zerado: PackageX,
  low_stock: AlertTriangle,
};

const METRIC_TONE: Record<string, "blue" | "red" | "amber"> = {
  total_products: "blue",
  out_of_stock: "red",
  erp_zerado: "red",
  low_stock: "amber",
};

export default function DemandaEstoquePage() {
  return (
    <AccessGuard perm="manage_estoque">
      <DemandaEstoquePageInner />
    </AccessGuard>
  );
}

function DemandaEstoquePageInner() {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const { data, loading, error } = useApi<InventorySummaryResponse>(`/api/inventory/summary?limit=600&search=${encodeURIComponent(search)}`);
  const products = useMemo(() => data?.products ?? [], [data]);
  const filteredProducts = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(q) || p.btu?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q));
  }, [products, tableFilter]);

  const topDemanda = data?.topDemanda ?? [];
  const outOfStockRequests = data?.outOfStockRequests ?? [];
  const estoqueSincronizado = data?.estoqueSincronizado ?? false;

  const handleExportCsv = () => {
    const headers = ["Produto", "Marca", "BTU", "Categoria", "Preço", "Estoque", "Disponível"];
    const rows = filteredProducts.map((p) => [p.name, p.brand, p.btu, p.category, p.price, p.stock, p.available]);
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
      subtitle="Catálogo do ERP e demanda registrada pelos agentes"
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
          {!estoqueSincronizado && (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-bold">Estoque não sincronizado.</strong> A carga do ERP traz código,
                nome, marca e preço, mas não a quantidade — a coluna <span className="font-data">estoque</span>{" "}
                está vazia nos {formatNumber(products.length)} produtos. Os números de estoque só passam a
                valer quando a sincronização trouxer esse campo.
              </span>
            </div>
          )}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.metrics.map((m) => (
              <ConsoleMetric
                key={m.id}
                label={m.label}
                value={formatNumber(m.value)}
                icon={METRIC_ICON[m.id] ?? Boxes}
                tone={METRIC_TONE[m.id] ?? "amber"}
              />
            ))}
            <ConsoleMetric label="Categorias" value={data.breakdowns.bySource.length} helper="Segmentos comerciais" icon={Boxes} tone="violet" />
            <ConsoleMetric
              label="Disponível"
              value={estoqueSincronizado ? formatNumber(products.filter((p) => (p.stock ?? 0) > 10).length) : "não sincronizado"}
              helper="Produtos com estoque normal"
              icon={PackageCheck}
              tone="green"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ConsoleCard>
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Mais procurados e não atendidos</h2>
              <p className="mb-4 mt-0.5 text-[12px] text-[var(--text-muted)]">
                BTU e marca extraídos do que o cliente pediu ao agente
              </p>
              <div className="space-y-3">
                {topDemanda.slice(0, 8).map((t) => (
                  <DemandBar
                    key={`${t.tipo}-${t.termo}`}
                    label={t.termo}
                    value={t.total}
                    max={topDemanda[0]?.total ?? 1}
                    aviso={t.noCatalogo === false ? "fora do catálogo" : null}
                  />
                ))}
                {!topDemanda.length && (
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Nenhum pedido não atendido registrado ainda.
                  </p>
                )}
              </div>
            </ConsoleCard>
            <ConsoleCard>
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Últimos pedidos não atendidos</h2>
              <p className="mb-4 mt-0.5 text-[12px] text-[var(--text-muted)]">Texto exato que o cliente usou</p>
              <div className="space-y-2">
                {outOfStockRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                    <p className="text-[12px] font-bold text-[var(--text-primary)]">{req.productName}</p>
                    <ConsoleStatus tone="red">{formatDateTime(req.createdAt)}</ConsoleStatus>
                  </div>
                ))}
                {!outOfStockRequests.length && <p className="text-[12px] text-[var(--text-muted)]">Nenhum pedido sem estoque registrado.</p>}
              </div>
            </ConsoleCard>
          </section>

          <ConsoleCard pad={false}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
              <input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Filtrar por modelo, BTU ou marca..."
                className="w-full bg-transparent text-[12px] font-semibold text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {tableFilter && (
                <span className="shrink-0 font-data text-[11px] text-[var(--text-muted)]">{filteredProducts.length} resultado{filteredProducts.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            <ConsoleTable headers={["Produto", "Marca", "BTU", "Categoria", "Preço", "Estoque", "Disponível", "Status"]}>
              {filteredProducts.map((p) => (
                <tr key={`${p.source}-${p.id}`} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[var(--text-primary)]">{p.name ?? "-"}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{p.erpCode ?? p.id}</p>
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{p.brand ?? "-"}</td>
                  <td className="px-3 py-3 font-data text-[var(--text-secondary)]">{p.btu ?? "-"}</td>
                  <td className="px-3 py-3"><ConsoleStatus tone="slate">{p.category ?? sourceLabel(p.source)}</ConsoleStatus></td>
                  <td className="px-3 py-3 font-data font-semibold text-[var(--text-primary)]">{formatMoney(p.price)}</td>
                  {/* `?? 0` mostrava 0 e marcava "Critico" nas 3.043 linhas, porque
                      o ERP não sincroniza quantidade. Sem dado a célula fica vazia. */}
                  <td className="px-3 py-3 font-data">{p.stock == null ? "—" : formatNumber(p.stock)}</td>
                  <td className="px-3 py-3 font-data">{p.available == null ? "—" : formatNumber(p.available)}</td>
                  <td className="px-3 py-3">
                    {p.stock == null ? (
                      <span className="text-[11px] text-[var(--text-muted)]">sem dado</span>
                    ) : (
                      <ConsoleStatus tone={stockTone(p.stock)}>
                        {p.stock <= 0 ? "Crítico" : p.stock <= 10 ? "Baixo" : "OK"}
                      </ConsoleStatus>
                    )}
                  </td>
                </tr>
              ))}
            </ConsoleTable>
          </ConsoleCard>
        </>
      )}
    </ConsolePage>
  );
}

/** A barra já teve o comprimento derivado da POSIÇÃO no array (140 - index*26),
 *  com "140 solic." escrito ao lado de um produto que ninguém tinha pedido.
 *  Agora `value` é a contagem real e a largura é proporcional ao topo da lista. */
function DemandBar({
  label,
  value,
  max,
  aviso,
}: {
  label: string;
  value: number;
  max: number;
  aviso?: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[var(--text-secondary)]">{label}</span>
          {aviso && <ConsoleStatus tone="amber">{aviso}</ConsoleStatus>}
        </span>
        <span className="shrink-0 font-data text-[var(--text-primary)]">
          {value} pedido{value !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-subtle)]">
        <div
          className="h-full rounded-full bg-blue-400"
          style={{ width: `${Math.max(4, (value / Math.max(max, 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
