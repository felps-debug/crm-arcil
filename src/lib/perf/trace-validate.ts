/**
 * Validação do que o browser manda para /api/perf/traces.
 *
 * O corpo vem do cliente, então nada é confiado: só passam os campos do
 * contrato, com os valores dentro das listas. Qualquer outra coisa — e-mail,
 * telefone, um userId forjado — é descartada aqui e nunca chega ao banco.
 */

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const JOURNEYS = ["dashboard", "leads", "login", "other"] as const;
export const LOAD_KINDS = ["cold", "warm"] as const;
export const BROWSER_STAGES = ["ttfb", "ready", "hydrated", "revalidated"] as const;
export const OUTCOMES = ["ok", "error", "timeout"] as const;

const MAX_STAGES = 20;
const MAX_DURATION_MS = 600_000;

export type BrowserTrace = {
  traceId: string;
  journey: (typeof JOURNEYS)[number];
  loadKind: (typeof LOAD_KINDS)[number];
  stages: { stage: (typeof BROWSER_STAGES)[number]; durationMs: number; outcome: (typeof OUTCOMES)[number] }[];
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export function parseBrowserTrace(body: unknown): BrowserTrace | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.traceId !== "string" || !UUID_V4.test(b.traceId)) return null;
  if (!isOneOf(JOURNEYS, b.journey) || !isOneOf(LOAD_KINDS, b.loadKind)) return null;
  if (!Array.isArray(b.stages) || b.stages.length === 0 || b.stages.length > MAX_STAGES) return null;

  const stages: BrowserTrace["stages"] = [];
  for (const raw of b.stages) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (!isOneOf(BROWSER_STAGES, s.stage) || !isOneOf(OUTCOMES, s.outcome)) return null;
    if (typeof s.durationMs !== "number" || !Number.isFinite(s.durationMs)) return null;
    const durationMs = Math.round(s.durationMs);
    if (durationMs < 0 || durationMs >= MAX_DURATION_MS) return null;
    stages.push({ stage: s.stage, durationMs, outcome: s.outcome });
  }

  return { traceId: b.traceId, journey: b.journey, loadKind: b.loadKind, stages };
}
