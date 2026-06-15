"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { MetricCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useSupabase } from "@/hooks/use-supabase";
import { getProducts, getProductStats } from "@/lib/supabase/queries";
import type { Product } from "@/types";
import {
  Package, PackageX, AlertTriangle, BarChart3, Search,
} from "lucide-react";

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DemandaEstoquePage() {
  const [search,  setSearch]  = useState("");
  const [sortBy,  setSortBy]  = useState<"name" | "stock" | "price">("name");

  const { data: products, loading: loadingProducts, error: errorProducts, refetch: refetchProducts } =
    useSupabase(() => getProducts(), []);

  const { data: stats, loading: loadingStats, error: errorStats, refetch: refetchStats } =
    useSupabase(() => getProductStats(), []);

  const filtered = (products ?? [])
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.categoria_nome?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "stock") return (a.stock_qty ?? 0) - (b.stock_qty ?? 0);
      if (sortBy === "price") return (b.price ?? 0) - (a.price ?? 0);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  const hasData = (products?.length ?? 0) > 0;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Demanda & Estoque" subtitle="Produtos, estoque e demanda dos clientes" />

      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-[1440px] mx-auto w-full">
        {/* Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingStats ? (
            Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : errorStats ? (
            <div className="col-span-full">
              <ErrorState message={errorStats} onRetry={refetchStats} />
            </div>
          ) : (
            <>
              <MetricCard
                label="Total Produtos"
                value={String(stats?.totalProducts ?? 0)}
                icon={Package}
                accent="blue"
              />
              <MetricCard
                label="Sem Estoque"
                value={String(stats?.outOfStock ?? 0)}
                icon={PackageX}
                accent="red"
              />
              <MetricCard
                label="Estoque Baixo"
                value={String(stats?.lowStock ?? 0)}
                icon={AlertTriangle}
                accent="amber"
              />
              <MetricCard
                label="Categorias"
                value={String(Object.keys(stats?.categories ?? {}).length)}
                icon={BarChart3}
                accent="emerald"
              />
            </>
          )}
        </section>

        {/* Products table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                icon={Package}
                title="Catálogo de Produtos"
                subtitle="Sincronizado do ERP Net1"
              />

              {hasData && (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar produto..."
                      className="pl-9 pr-3 py-2 rounded-xl border text-[13px] bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all w-48"
                    />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "name" | "stock" | "price")}
                    className="px-3 py-2 rounded-xl border text-[13px] bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] focus:outline-none focus:border-blue-400 transition-all"
                  >
                    <option value="name">Nome A-Z</option>
                    <option value="stock">Menor estoque</option>
                    <option value="price">Maior preço</option>
                  </select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingProducts ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : errorProducts ? (
              <div className="p-5">
                <ErrorState message={errorProducts} onRetry={refetchProducts} />
              </div>
            ) : !hasData ? (
              <div className="text-center py-20">
                <div
                  className="w-20 h-20 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mx-auto mb-5"
                >
                  <Package size={36} className="text-[var(--text-muted)]" />
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
                  Aguardando sincronização do ERP
                </h3>
                <p className="text-sm max-w-md mx-auto text-[var(--text-muted)]">
                  Os produtos serão importados automaticamente do ERP Net1.
                  Quando sincronizado, você verá o catálogo completo com estoque, preços e demanda.
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  {["Estoque em tempo real", "Produtos mais solicitados", "Alertas de estoque baixo"].map((feat) => (
                    <span
                      key={feat}
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        background: "var(--bg-subtle)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Produto", "Categoria", "Preço", "Preço Revenda", "Estoque", "Última Sync"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const stockLevel   = p.stock_qty ?? 0;
                      const stockVariant = stockLevel === 0 ? "danger" : stockLevel <= 10 ? "warning" : "success";

                      return (
                        <tr key={p.id}>
                          <td className="font-semibold text-[var(--text-primary)]">
                            {p.name ?? "—"}
                          </td>
                          <td>
                            <Badge variant="info">
                              {p.categoria_nome ?? p.category ?? "—"}
                            </Badge>
                          </td>
                          <td className="tabular-nums text-[var(--text-primary)] font-medium">
                            {formatCurrency(p.price)}
                          </td>
                          <td className="tabular-nums text-[var(--text-secondary)]">
                            {formatCurrency(p.preco_revenda)}
                          </td>
                          <td>
                            <Badge variant={stockVariant}>{stockLevel} un.</Badge>
                          </td>
                          <td className="text-xs tabular-nums text-[var(--text-muted)]">
                            {p.synced_at
                              ? new Date(p.synced_at).toLocaleString("pt-BR")
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
