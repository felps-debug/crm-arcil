import { requireStaffUser, handleApiError } from "@/lib/server/api-auth";
import { getLeadConversations } from "@/lib/server/crm-data";

// requireStaffUser e não requireApiUser: a conversa traz o que o cliente
// escreveu, e um lead id é fácil de enumerar. Perfil "client" não passa.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireStaffUser();
  if (response) return response;

  try {
    const { id } = await params;
    const conversations = await getLeadConversations(id);
    if (!conversations) return Response.json({ error: "Lead não encontrado" }, { status: 404 });
    return Response.json(conversations);
  } catch (error) {
    return handleApiError(error);
  }
}
