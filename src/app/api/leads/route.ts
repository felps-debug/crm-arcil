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
      // Os drilldowns do dashboard mandavam estes cinco e ninguem lia: o usuario
      // clicava em "Handoff sem aceite" e caia na lista inteira.
      handoff: url.searchParams.get("handoff"),
      period: url.searchParams.get("period"),
      late: url.searchParams.get("late"),
      respondeu: url.searchParams.get("respondeu"),
      hasQuotes: url.searchParams.get("hasQuotes"),
      hasSales: url.searchParams.get("hasSales"),
      limit: url.searchParams.get("limit"),
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
