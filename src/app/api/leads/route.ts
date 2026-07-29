import { requireApiUser, handleApiError } from "@/lib/server/api-auth";
import { getLeads } from "@/lib/server/crm-data";

export async function GET(request: Request) {
  const { response } = await requireApiUser();
  if (response) return response;

  try {
    const url = new URL(request.url);
    return Response.json(await getLeads({
      segment: url.searchParams.get("segment"),
      status: url.searchParams.get("status"),
      city: url.searchParams.get("city"),
      origin: url.searchParams.get("origin"),
      responsible: url.searchParams.get("responsible"),
      search: url.searchParams.get("search"),
      unassigned: url.searchParams.get("unassigned"),
      withoutFollowup: url.searchParams.get("withoutFollowup"),
      limit: url.searchParams.get("limit"),
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
