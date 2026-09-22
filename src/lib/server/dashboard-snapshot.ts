import { canManage, isStaff, type ApiContext } from "@/lib/server/api-auth";
import {
  buildActivity,
  buildAgents,
  buildInventoryCounts,
  buildPending,
  buildSummary,
  countUrgentFollowups,
  fetchCore,
  fetchHandoffDecisions,
  fetchSheetSources,
} from "@/lib/server/crm-data";
import { fetchProductMetrics } from "@/lib/server/product-metrics";
import { timeStage } from "@/lib/perf/trace-context";
import {
  DASHBOARD_SECTIONS,
  type DashboardSection,
  type DashboardSnapshotSections,
  type SectionResult,
} from "@/types/api";

export type SnapshotLoaders = {
  core: typeof fetchCore;
  handoffDecisions: typeof fetchHandoffDecisions;
  sheetSources: typeof fetchSheetSources;
  productMetrics: typeof fetchProductMetrics;
};

const defaultLoaders: SnapshotLoaders = {
  core: fetchCore,
  handoffDecisions: fetchHandoffDecisions,
  sheetSources: fetchSheetSources,
  productMetrics: fetchProductMetrics,
};

export class InvalidSectionError extends Error {
  constructor(public readonly section: string) {
    super(`Seção inválida: ${section}`);
  }
}

/** `?sections=a,b` → lista validada. Vazio = todas. */
export function parseSections(raw: string | null): DashboardSection[] {
  if (!raw?.trim()) return [...DASHBOARD_SECTIONS];
  const names = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  for (const name of names) {
    if (!(DASHBOARD_SECTIONS as readonly string[]).includes(name)) throw new InvalidSectionError(name);
  }
  return names as DashboardSection[];
}

/**
 * Quem pode ver cada seção — as MESMAS regras que existiam antes do snapshot:
 *
 * - inventory: era /api/inventory/summary, que exige manage_estoque.
 * - activity e urgentFollowups: eram lidas no browser, com a RLS `staff_read_*`
 *   barrando a role client. Aqui elas passam pelo admin client, que ignora RLS,
 *   então a regra tem que ser reaplicada à mão — senão um client passaria a ver
 *   o que hoje não vê.
 * - o resto: qualquer usuário autenticado, como as rotas antigas.
 */
function allowed(ctx: ApiContext, section: DashboardSection) {
  if (section === "inventory") return canManage(ctx, "manage_estoque");
  if (section === "activity" || section === "urgentFollowups") return isStaff(ctx);
  return true;
}

/** Promise criada na primeira vez que alguém pede, compartilhada pelas demais. */
function once<T>(load: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => (promise ??= load());
}

export type SnapshotResult = {
  generatedAt: string;
  sections: Partial<DashboardSnapshotSections>;
};

/**
 * Monta as seções pedidas lendo cada fonte uma vez só.
 *
 * Antes eram quatro rotas em paralelo, cada uma com auth, perfil e o próprio
 * fetchCore; o cache de 5s dentro de crm-data só ajudava quando as quatro
 * caíam na mesma instância serverless. Aqui o compartilhamento é garantido.
 */
export async function buildDashboardSnapshot(
  ctx: ApiContext,
  sections: DashboardSection[],
  loaders: SnapshotLoaders = defaultLoaders
): Promise<SnapshotResult> {
  // Cada fonte cronometrada uma vez (lib/perf): é o que aparece no
  // Server-Timing e em performance_traces para dizer onde o tempo foi.
  const core = once(() => timeStage("core", loaders.core));
  const handoffDecisions = once(() => timeStage("handoffDecisions", loaders.handoffDecisions));
  const sheetSources = once(() => timeStage("sheetSources", loaders.sheetSources));
  const productMetrics = once(() => timeStage("products", loaders.productMetrics));

  const builders: { [K in DashboardSection]: () => Promise<unknown> } = {
    summary: async () => buildSummary(await core(), await handoffDecisions(), await productMetrics()),
    pending: async () => buildPending(await core(), await sheetSources(), await productMetrics()),
    agents: async () => buildAgents(await core()),
    inventory: async () => {
      const { estoqueSincronizado, metrics } = buildInventoryCounts(await productMetrics());
      return { estoqueSincronizado, metrics };
    },
    activity: async () => buildActivity(await core()),
    urgentFollowups: async () => ({ count: countUrgentFollowups(await core()) }),
  };

  const results = await Promise.all(
    sections.map(async (section): Promise<[DashboardSection, SectionResult<unknown>]> => {
      if (!allowed(ctx, section)) return [section, { status: "forbidden" }];
      try {
        return [section, { status: "ok", data: await timeStage(`section:${section}`, builders[section]) }];
      } catch (error) {
        // Detalhe fica no log do servidor; o cliente só sabe que a seção falhou.
        console.error(`[dashboard/snapshot] seção ${section} falhou`, error);
        return [section, { status: "error", message: "Erro ao carregar esta seção." }];
      }
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    sections: Object.fromEntries(results) as Partial<DashboardSnapshotSections>,
  };
}
