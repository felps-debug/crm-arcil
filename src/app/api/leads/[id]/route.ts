import { requireStaffUser, handleApiError } from "@/lib/server/api-auth";
import { getLeadDetail } from "@/lib/server/crm-data";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireStaffUser();
  if (response) return response;

  try {
    const { id } = await context.params;
    const detail = await getLeadDetail(id);
    if (!detail) return Response.json({ error: "Lead not found" }, { status: 404 });
    return Response.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}
