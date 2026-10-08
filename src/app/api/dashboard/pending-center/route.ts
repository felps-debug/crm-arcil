import { requireUnscopedUser, handleApiError } from "@/lib/server/api-auth";
import { getPendingCenter } from "@/lib/server/crm-data";

// Rota de compatibilidade, sem versão filtrada por segmento: quem está preso a
// um segmento usa /api/dashboard/snapshot.
export async function GET() {
  const startedAt = Date.now();
  const { response } = await requireUnscopedUser();
  if (response) {
    console.info(`[dashboard/pending-center] auth ${Date.now() - startedAt}ms`);
    return response;
  }

  try {
    const result = await getPendingCenter();
    console.info(`[dashboard/pending-center] ok ${Date.now() - startedAt}ms`);
    return Response.json(result);
  } catch (error) {
    console.error(`[dashboard/pending-center] failed ${Date.now() - startedAt}ms`);
    return handleApiError(error);
  }
}
