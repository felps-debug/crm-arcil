import { after } from "next/server";
import { handleApiError, loadApiContext, verifyApiUser } from "@/lib/server/api-auth";
import {
  buildDashboardSnapshot,
  InvalidSectionError,
  parseSections,
  prefetchSnapshotData,
} from "@/lib/server/dashboard-snapshot";
import {
  currentTrace,
  persistTrace,
  readTraceId,
  serverTimingHeader,
  withTrace,
  type StageOutcome,
  type TraceStage,
} from "@/lib/perf/trace-server";
import type { DashboardSnapshotResponse } from "@/types/api";

const ROUTE = "/api/dashboard/snapshot";

/**
 * Tudo que o dashboard mostra, numa request: uma verificação de identidade, uma
 * leitura de perfil, cada tabela lida uma vez. Permissões por seção em
 * lib/server/dashboard-snapshot.ts. Contrato em
 * specs/001-otimizar-performance-crm/contracts/dashboard-snapshot.md.
 */
export async function GET(request: Request) {
  const traceId = readTraceId(request);
  return withTrace(traceId, async () => {
    const started = performance.now();
    let userId: string | null = null;
    let outcome: StageOutcome = "ok";

    // Depois da resposta: grava as etapas sem somar latência à tela.
    const finish = (response: Response) => {
      const trace = currentTrace();
      const stages: TraceStage[] = [
        ...(trace?.stages ?? []),
        { stage: "total", durationMs: Math.round(performance.now() - started), outcome },
      ];
      const supabaseRequests = trace?.supabaseRequests ?? 0;
      after(() =>
        persistTrace(
          stages.map((s) => ({
            trace_id: traceId,
            journey: "dashboard",
            origin: "server",
            stage: s.stage,
            duration_ms: s.durationMs,
            outcome: s.outcome,
            supabase_requests: s.stage === "total" ? supabaseRequests : null,
            route: ROUTE,
            user_id: userId,
          }))
        )
      );
      response.headers.set("Server-Timing", serverTimingHeader(stages));
      response.headers.set("x-trace-id", traceId);
      return response;
    };

    let sections;
    try {
      sections = parseSections(new URL(request.url).searchParams.get("sections"));
    } catch (error) {
      if (error instanceof InvalidSectionError) {
        outcome = "error";
        return finish(Response.json({ error: error.message }, { status: 400 }));
      }
      throw error;
    }

    const { user, response } = await verifyApiUser();
    if (response) {
      outcome = "forbidden";
      return finish(response);
    }
    userId = user.id;

    try {
      // Identidade já verificada: as leituras saem agora, em paralelo com o
      // perfil. As permissões por seção continuam decididas antes de qualquer
      // dado entrar na resposta (buildDashboardSnapshot).
      const data = prefetchSnapshotData(sections);
      const ctx = await loadApiContext(user.id);
      const snapshot = await buildDashboardSnapshot(ctx, sections, undefined, data);
      const results = Object.values(snapshot.sections);
      if (results.length && results.every((r) => r?.status === "error")) {
        outcome = "error";
        return finish(Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 }));
      }

      const body: DashboardSnapshotResponse = { ...snapshot, traceId };
      return finish(Response.json(body, { headers: { "Cache-Control": "private, no-store" } }));
    } catch (error) {
      outcome = "error";
      return finish(handleApiError(error));
    }
  });
}
