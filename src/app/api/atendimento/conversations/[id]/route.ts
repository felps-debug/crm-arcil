import { NextRequest } from "next/server";
import { requireAtendimentoScope, handleApiError } from "@/lib/server/api-auth";
import { getConversation, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { scopedInboxId, response } = await requireAtendimentoScope();
  if (response) return response;

  try {
    const { id } = await params;
    const conversation = await getConversation(id);

    // A vendor scoped to one inbox can't fetch another inbox's conversation
    // just by knowing/guessing its id.
    if (scopedInboxId != null && conversation.inboxId !== scopedInboxId) {
      return Response.json({ error: "Você não tem acesso a esta conversa." }, { status: 403 });
    }

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
