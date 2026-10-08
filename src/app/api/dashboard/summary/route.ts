import { requireUnscopedUser, handleApiError } from "@/lib/server/api-auth";
import { getDashboardSummary } from "@/lib/server/crm-data";

// Rota de compatibilidade, sem versão filtrada por segmento: quem está preso a
// um segmento usa /api/dashboard/snapshot.
export async function GET() {
  const startedAt = Date.now();
  const { response } = await requireUnscopedUser();
  if (response) {
    console.info(`[dashboard/summary] auth ${Date.now() - startedAt}ms`);
    return response;
  }

  try {
    const result = await getDashboardSummary();
    console.info(`[dashboard/summary] ok ${Date.now() - startedAt}ms`);
    return Response.json(result);
  } catch (error) {
    console.error(`[dashboard/summary] failed ${Date.now() - startedAt}ms`);
    return handleApiError(error);
  }
}
