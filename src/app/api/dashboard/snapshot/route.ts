import { handleApiError, resolveApiContext } from "@/lib/server/api-auth";
import { buildDashboardSnapshot, InvalidSectionError, parseSections } from "@/lib/server/dashboard-snapshot";
import type { DashboardSnapshotResponse } from "@/types/api";

/**
 * Tudo que o dashboard mostra, numa request: uma verificação de identidade, uma
 * leitura de perfil, cada tabela lida uma vez. Permissões por seção em
 * lib/server/dashboard-snapshot.ts. Contrato em
 * specs/001-otimizar-performance-crm/contracts/dashboard-snapshot.md.
 */
export async function GET(request: Request) {
  let sections;
  try {
    sections = parseSections(new URL(request.url).searchParams.get("sections"));
  } catch (error) {
    if (error instanceof InvalidSectionError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const { ctx, response } = await resolveApiContext();
  if (response) return response;

  try {
    const snapshot = await buildDashboardSnapshot(ctx, sections);
    const results = Object.values(snapshot.sections);
    if (results.length && results.every((r) => r?.status === "error")) {
      return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
    }

    const body: DashboardSnapshotResponse = { ...snapshot, traceId: crypto.randomUUID() };
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
