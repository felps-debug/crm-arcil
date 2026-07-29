import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getDashboardSummary } from "@/lib/server/crm-data";

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  try {
    return Response.json(await getDashboardSummary());
  } catch (error) {
    return handleApiError(error);
  }
}
