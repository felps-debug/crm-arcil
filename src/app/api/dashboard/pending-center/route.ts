import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getPendingCenter } from "@/lib/server/crm-data";

export async function GET() {
  const startedAt = Date.now();
  const { response } = await requireApiUser();
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
