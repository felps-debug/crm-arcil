import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Números do catálogo, calculados no banco por `public.product_metrics()`
 * (supabase/migrations/20260923_product_metrics.sql).
 *
 * Antes cada tela contava por conta própria, paginando `codigo_erp` das tabelas
 * de produto em série — até dez idas ao banco por carga do dashboard, cada uma
 * disputando com o sync do ERP. E três lugares com três regras quase iguais
 * deram três números diferentes para o mesmo estoque. Agora é uma consulta e
 * uma regra.
 */
export type ProductMetrics = {
  total_distintos: number;
  com_estoque_conhecido: number;
  /** estoque > 0 */
  disponiveis: number;
  /** estoque conhecido e <= 0. Nulo é "não sincronizado", nunca zero. */
  zerados: number;
  /** estoque entre 1 e 10 */
  estoque_baixo: number;
  sincronizado: boolean;
};

export type ProductMetricRow = {
  tabela: string;
  id: string;
  codigo_erp: string | null;
  estoque: number | null;
};

/**
 * A mesma regra da função SQL, em memória. É a especificação executável dela:
 * os testes rodam aqui, e a migração é conferida contra isto sobre os dados reais.
 *
 * - Produto = `codigo_erp`. A mesma geladeira tem uma linha por segmento
 *   comercial (consumer, reseller...) só para carregar o preço de cada canal.
 * - Linha sem `codigo_erp` não tem par possível: conta sozinha.
 * - Saldo do produto = o maior entre os segmentos. O ERP manda o mesmo saldo
 *   para todos, mas no meio de um sync um segmento pode estar à frente do outro.
 */
export function aggregateProductMetrics(rows: ProductMetricRow[]): ProductMetrics {
  const saldo = new Map<string, number | null>();
  for (const r of rows) {
    const chave = r.codigo_erp ?? `linha:${r.tabela}:${r.id}`;
    const atual = saldo.get(chave);
    if (atual === undefined) saldo.set(chave, r.estoque);
    else if (r.estoque != null && (atual == null || r.estoque > atual)) saldo.set(chave, r.estoque);
  }

  const conhecidos = [...saldo.values()].filter((v): v is number => v != null);
  return {
    total_distintos: saldo.size,
    com_estoque_conhecido: conhecidos.length,
    disponiveis: conhecidos.filter((v) => v > 0).length,
    zerados: conhecidos.filter((v) => v <= 0).length,
    estoque_baixo: conhecidos.filter((v) => v >= 1 && v <= 10).length,
    sincronizado: conhecidos.length > 0,
  };
}

export async function fetchProductMetrics(): Promise<ProductMetrics> {
  const { data, error } = await createAdminClient().rpc("product_metrics").single();
  if (error) throw error;
  return data as ProductMetrics;
}
