import { requireAtendimentoScope, handleApiError } from "@/lib/server/api-auth";
import { listInboxes, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";
import { canSeeInbox } from "@/lib/server/inbox-scope";

// Names only (no message content). Quem tem escopo vê só os próprios inboxes —
// listar os de todo mundo entregaria o nome de cada número da empresa. O painel
// admin (superadmin) passa sem escopo e recebe a lista inteira para o seletor.
export async function GET() {
  const { scopedInboxIds, response } = await requireAtendimentoScope();
  if (response) return response;

  try {
    const inboxes = (await listInboxes()).filter((inbox) => canSeeInbox(scopedInboxIds, inbox.id));
    return Response.json({ inboxes });
  } catch (error) {
    if (error instanceof ChatwootNotConfiguredError) {
      return Response.json({ error: error.message, code: "chatwoot_not_configured" }, { status: 503 });
    }
    if (error instanceof ChatwootApiError) {
      console.error("[atendimento/inboxes]", error);
      return Response.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
