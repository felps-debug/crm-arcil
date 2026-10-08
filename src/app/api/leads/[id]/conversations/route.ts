import { requireUnscopedStaff, handleApiError } from "@/lib/server/api-auth";
import { getLeadConversations } from "@/lib/server/crm-data";

// requireUnscopedStaff e não requireApiUser: a conversa traz o que o cliente
// escreveu, e um lead id é fácil de enumerar. Perfil "client" não passa, e o
// papel preso a um segmento (installer_manager) também não — não existe versão
// filtrada desta rota, e ela serve o board financeiro.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUnscopedStaff();
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
