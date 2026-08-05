import type { ApiComparison, ApiDrilldown, ApiMetric, ApiPeriod } from "@/types/api";

export function defaultPeriod(): ApiPeriod {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    label: "Últimos 30 dias",
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function allTimePeriod(): ApiPeriod {
  return {
    label: "Base completa",
    from: null,
    to: null,
  };
}

export function previousValue(value: number | string | null, previous?: number | string | null): ApiComparison {
  return {
    label: "Período anterior",
    value: previous ?? null,
    deltaPercent: typeof value === "number" && typeof previous === "number" && previous !== 0
      ? Math.round(((value - previous) / previous) * 1000) / 10
      : null,
  };
}

export function metric(input: {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  formula: string;
  period?: ApiPeriod;
  previous?: number | string | null;
  tooltip: string;
  drilldown: ApiDrilldown;
}): ApiMetric {
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    unit: input.unit,
    formula: input.formula,
    period: input.period ?? allTimePeriod(),
    previous: previousValue(input.value, input.previous),
    tooltip: input.tooltip,
    drilldown: input.drilldown,
  };
}

export function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export const UNKNOWN_BUCKET = "__unknown__";

/** `id` guarda o valor cru da coluna (ACTIVE, INSTALLER…) para servir de filtro
 * no drilldown; `label` é o texto traduzido que vai para a tela. Antes os dois
 * eram o mesmo rótulo, então qualquer link montado a partir daqui filtrava por
 * "Ativo" em vez de "ACTIVE" e não trazia nada. */
export function countBy<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
  getLabel?: (key: string) => string
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item) || UNKNOWN_BUCKET;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, value]) => ({
      id,
      label: id === UNKNOWN_BUCKET ? "Sem informação" : getLabel?.(id) ?? id,
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

export function isOlderThan(date: string | null | undefined, hours: number) {
  if (!date) return true;
  return Date.now() - new Date(date).getTime() > hours * 60 * 60 * 1000;
}
