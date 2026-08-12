import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getDashboardSummary } from "@/lib/server/crm-data";

export async function GET() {
  const startedAt = Date.now();
  const { response } = await requireApiUser();
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
