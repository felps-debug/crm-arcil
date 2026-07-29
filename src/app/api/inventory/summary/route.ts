import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getInventorySummary } from "@/lib/server/crm-data";

export async function GET(request: Request) {
  const { response } = await requireApiUser();
  if (response) return response;

  try {
    return Response.json(await getInventorySummary(new URL(request.url).searchParams));
  } catch (error) {
    return handleApiError(error);
  }
}
