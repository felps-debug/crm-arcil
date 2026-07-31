import { NextRequest } from "next/server";
import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { getConversation, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiPermission("manage_atendimento");
  if (response) return response;

  try {
    const { id } = await params;
    const conversation = await getConversation(id);
    return Response.json({ conversation });
  } catch (error) {
    if (error instanceof ChatwootNotConfiguredError) {
      return Response.json({ error: error.message, code: "chatwoot_not_configured" }, { status: 503 });
    }
    if (error instanceof ChatwootApiError) {
      console.error("[atendimento/conversations/:id]", error);
      return Response.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
