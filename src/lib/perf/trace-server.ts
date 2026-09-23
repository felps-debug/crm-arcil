import { createAdminClient } from "@/lib/supabase/admin";
import { VERCEL_GIT_COMMIT_SHA, VERCEL_REGION } from "@/lib/env";
import { UUID_V4 } from "@/lib/perf/trace-validate";
import type { StageOutcome, TraceStage } from "@/lib/perf/trace-context";

export { countSupabaseRequest, currentTrace, timeStage, withTrace } from "@/lib/perf/trace-context";
export type { StageOutcome, TraceStage } from "@/lib/perf/trace-context";

export function serverTimingHeader(stages: TraceStage[]) {
  return stages.map((s) => `${s.stage.replace(/[^A-Za-z0-9_-]/g, "_")};dur=${s.durationMs}`).join(", ");
}

/** Id da jornada vindo do browser, se for um UUID v4 de verdade; senão um novo. */
export function readTraceId(request: Request) {
  const fromBrowser = request.headers.get("x-trace-id");
  return fromBrowser && UUID_V4.test(fromBrowser) ? fromBrowser : crypto.randomUUID();
}

type TraceRow = {
  trace_id: string;
  journey: string;
  origin: "browser" | "server";
  stage: string;
  duration_ms: number;
  outcome: StageOutcome;
  load_kind?: "cold" | "warm" | null;
  supabase_requests?: number | null;
  route?: string | null;
  deployment: string;
  region: string;
  user_id: string | null;
};

/**
 * Grava as etapas. Chamar dentro de `after()`: roda depois que a resposta saiu,
 * então não soma latência a quem está esperando a tela. Falha de gravação só
 * vai para o log — medir nunca pode quebrar o CRM.
 *
 * Só UUID e números entram aqui. Nada de e-mail, telefone, token, query string
 * ou corpo de request (RF-021).
 */
export async function persistTrace(
  rows: Omit<TraceRow, "deployment" | "region">[]
): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await createAdminClient()
      .from("performance_traces")
      .insert(rows.map((r) => ({ ...r, deployment: VERCEL_GIT_COMMIT_SHA, region: VERCEL_REGION })));
    if (error) console.error("[perf] falha ao gravar traço", error.message);
  } catch (error) {
    console.error("[perf] falha ao gravar traço", error instanceof Error ? error.message : error);
  }
}
