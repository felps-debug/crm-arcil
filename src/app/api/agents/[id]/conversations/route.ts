import { requireStaffUser, handleApiError } from "@/lib/server/api-auth";
import { getVendorConversations } from "@/lib/server/crm-data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireStaffUser();
  if (response) return response;

  try {
    const { id } = await params;
    const data = await getVendorConversations(id);
    if (!data) return Response.json({ error: "Agente nao encontrado" }, { status: 404 });
    return Response.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
