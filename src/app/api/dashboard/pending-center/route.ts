import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getPendingCenter } from "@/lib/server/crm-data";

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  try {
    return Response.json(await getPendingCenter());
  } catch (error) {
    return handleApiError(error);
  }
}
