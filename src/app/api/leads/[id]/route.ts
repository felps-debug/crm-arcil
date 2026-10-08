import { requireStaffScope, handleApiError } from "@/lib/server/api-auth";
import { getLeadDetail } from "@/lib/server/crm-data";
import { scopeLeadDetail } from "@/lib/server/segment-scope";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { scope, response } = await requireStaffScope();
  if (response) return response;

  try {
    const { id } = await context.params;
    const detail = await getLeadDetail(id);
    // Lead de outro segmento responde 404, igual a um id que não existe.
    const visible = detail && scope ? scopeLeadDetail(detail, scope) : detail;
    if (!visible) return Response.json({ error: "Lead not found" }, { status: 404 });
    return Response.json(visible);
  } catch (error) {
    return handleApiError(error);
  }
}
