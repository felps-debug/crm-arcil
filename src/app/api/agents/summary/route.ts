import { requireScopedUser, handleApiError } from "@/lib/server/api-auth";
import { getAgentSummary } from "@/lib/server/crm-data";

export async function GET() {
  const { scope, response } = await requireScopedUser();
  if (response) return response;

  try {
    return Response.json(await getAgentSummary(scope));
  } catch (error) {
    return handleApiError(error);
  }
}
