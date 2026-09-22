import { describe, expect, it } from "vitest";
import { aggregateProductMetrics, type ProductMetricRow } from "./product-metrics";

const row = (tabela: string, id: string, codigo_erp: string | null, estoque: number | null): ProductMetricRow => ({
  tabela,
  id,
  codigo_erp,
  estoque,
});

describe("aggregateProductMetrics", () => {
  it("catálogo vazio: tudo zero e não sincronizado", () => {
    expect(aggregateProductMetrics([])).toEqual({
      total_distintos: 0,
      com_estoque_conhecido: 0,
      disponiveis: 0,
      zerados: 0,
      estoque_baixo: 0,
      sincronizado: false,
    });
  });

  it("estoque nulo é 'não sincronizado', não zero", () => {
    const m = aggregateProductMetrics([row("products_consumer", "a", "1", null), row("products_reseller", "b", "2", null)]);
    expect(m.total_distintos).toBe(2);
    expect(m.com_estoque_conhecido).toBe(0);
    expect(m.zerados).toBe(0);
    expect(m.sincronizado).toBe(false);
  });

  it("o mesmo codigo_erp em três segmentos é um produto só", () => {
    const m = aggregateProductMetrics([
      row("products_consumer", "a", "10", 5),
      row("products_reseller", "b", "10", 5),
      row("products_installer", "c", "10", 5),
    ]);
    expect(m.total_distintos).toBe(1);
    expect(m.disponiveis).toBe(1);
    expect(m.estoque_baixo).toBe(1);
    expect(m.sincronizado).toBe(true);
  });

  it("linhas sem codigo_erp contam cada uma por si, sem colidir", () => {
    const m = aggregateProductMetrics([row("products_consumer", "a", null, 3), row("products_reseller", "b", null, 3)]);
    expect(m.total_distintos).toBe(2);
    expect(m.disponiveis).toBe(2);
  });

  it("o saldo do produto é o maior entre os segmentos", () => {
    // Durante o sync um segmento pode já ter o saldo novo e outro ainda o velho.
    const m = aggregateProductMetrics([row("products_consumer", "a", "7", 0), row("products_reseller", "b", "7", 4)]);
    expect(m.zerados).toBe(0);
    expect(m.disponiveis).toBe(1);
  });

  it("classifica zero, baixo (1 a 10) e acima de 10", () => {
    const m = aggregateProductMetrics([
      row("products_consumer", "a", "1", 0),
      row("products_consumer", "b", "2", 1),
      row("products_consumer", "c", "3", 10),
      row("products_consumer", "d", "4", 11),
      row("products_consumer", "e", "5", -2),
    ]);
    expect(m.zerados).toBe(2);
    expect(m.estoque_baixo).toBe(2);
    expect(m.disponiveis).toBe(3);
    expect(m.com_estoque_conhecido).toBe(5);
  });

  it("acima de 1.000 produtos não trunca", () => {
    const rows = Array.from({ length: 1_500 }, (_, i) => row("products_reseller", `r${i}`, String(i), i % 2));
    const m = aggregateProductMetrics(rows);
    expect(m.total_distintos).toBe(1_500);
    expect(m.disponiveis).toBe(750);
    expect(m.zerados).toBe(750);
  });
});
