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
  productMetrics: typeof fetchProductMetrics;
};

const defaultLoaders: SnapshotLoaders = {
  core: fetchCore,
  handoffDecisions: fetchHandoffDecisions,
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

/** O que cada seção precisa ler. */
const SECTION_SOURCES: { [K in DashboardSection]: (keyof SnapshotLoaders)[] } = {
  summary: ["core", "handoffDecisions", "productMetrics"],
  pending: ["core", "productMetrics"],
  agents: ["core"],
  inventory: ["productMetrics"],
  activity: ["core"],
  urgentFollowups: ["core"],
};

const STAGE_NAMES: Record<keyof SnapshotLoaders, string> = {
  core: "core",
  handoffDecisions: "handoffDecisions",
  productMetrics: "products",
};

export type SnapshotData = { [K in keyof SnapshotLoaders]: () => ReturnType<SnapshotLoaders[K]> };

/**
 * Dispara AGORA, em paralelo, todas as leituras que as seções vão precisar.
 *
 * Antes cada fonte só começava quando a primeira seção pedia por ela, e as
 * seções pediam em sequência (`await core()` e só depois `await
 * productMetrics()`): no preview, produtos só saía depois dos ~4s do núcleo.
 * A rota chama isto antes de ler o perfil, então dados e perfil correm juntos.
 */
export function prefetchSnapshotData(
  sections: DashboardSection[],
  loaders: SnapshotLoaders = defaultLoaders
): SnapshotData {
  const needed = new Set(sections.flatMap((s) => SECTION_SOURCES[s]));
  const started = new Map<keyof SnapshotLoaders, Promise<unknown>>();
  for (const key of needed) {
    // Cronometrada uma vez (lib/perf): é o que aparece no Server-Timing e em
    // performance_traces para dizer onde o tempo foi.
    const promise = timeStage(STAGE_NAMES[key], loaders[key] as () => Promise<unknown>);
    // Quem consome trata o erro; isto só evita "unhandled rejection" se
    // nenhuma seção permitida chegar a usar a fonte.
    promise.catch(() => {});
    started.set(key, promise);
  }
  const get = <K extends keyof SnapshotLoaders>(key: K) => () =>
    (started.get(key) ?? Promise.reject(new Error(`fonte ${key} não pré-carregada`))) as ReturnType<SnapshotLoaders[K]>;
  return {
    core: get("core"),
    handoffDecisions: get("handoffDecisions"),
    productMetrics: get("productMetrics"),
  };
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
 *
 * `data`: leituras já disparadas pela rota (prefetchSnapshotData). Sem ele,
 * dispara aqui só o que as seções PERMITIDAS precisam.
 */
export async function buildDashboardSnapshot(
  ctx: ApiContext,
  sections: DashboardSection[],
  loaders: SnapshotLoaders = defaultLoaders,
  data?: SnapshotData
): Promise<SnapshotResult> {
  const src = data ?? prefetchSnapshotData(sections.filter((s) => allowed(ctx, s)), loaders);

  const builders: { [K in DashboardSection]: () => Promise<unknown> } = {
    summary: async () => {
      const [core, decisions, metrics] = await Promise.all([src.core(), src.handoffDecisions(), src.productMetrics()]);
      return buildSummary(core, decisions, metrics);
    },
    pending: async () => {
      const [core, metrics] = await Promise.all([src.core(), src.productMetrics()]);
      return buildPending(core, metrics);
    },
    agents: async () => buildAgents(await src.core()),
    inventory: async () => {
      const { estoqueSincronizado, metrics } = buildInventoryCounts(await src.productMetrics());
      return { estoqueSincronizado, metrics };
    },
    activity: async () => buildActivity(await src.core()),
    urgentFollowups: async () => ({ count: countUrgentFollowups(await src.core()) }),
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
