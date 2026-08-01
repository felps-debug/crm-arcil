import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { getActivityLog } from "@/lib/server/crm-data";

export async function GET() {
  const { response } = await requireApiPermission("view_all");
  if (response) return response;

  try {
    return Response.json(await getActivityLog());
  } catch (error) {
    return handleApiError(error);
  }
}
