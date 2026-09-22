import { after } from "next/server";
import { requireApiUser } from "@/lib/server/api-auth";
import { parseBrowserTrace } from "@/lib/perf/trace-validate";
import { persistTrace } from "@/lib/perf/trace-server";

/**
 * Etapas medidas no browser (primeiro byte, tela pronta), com o mesmo trace_id
 * das etapas do servidor. Contrato em
 * specs/001-otimizar-performance-crm/contracts/performance-traces.md.
 *
 * O user_id vem da sessão verificada, nunca do corpo. O corpo passa por
 * parseBrowserTrace, que descarta tudo fora do contrato.
 */
export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const trace = parseBrowserTrace(await request.json().catch(() => null));
  if (!trace) return Response.json({ error: "Traço inválido" }, { status: 400 });

  after(() =>
    persistTrace(
      trace.stages.map((s) => ({
        trace_id: trace.traceId,
        journey: trace.journey,
        origin: "browser",
        stage: s.stage,
        duration_ms: s.durationMs,
        outcome: s.outcome,
        load_kind: trace.loadKind,
        user_id: user.id,
      }))
    )
  );

  return new Response(null, { status: 202 });
}
