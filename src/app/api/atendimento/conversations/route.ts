import { requireAtendimentoScope, handleApiError } from "@/lib/server/api-auth";
import { listConversations, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function GET(request: Request) {
  const { scopedInboxId, response } = await requireAtendimentoScope();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    // scopedInboxId (vendor/employee) always wins over the client-supplied
    // filter — a scoped caller can't widen their own view by editing the URL.
    const requestedInboxId = url.searchParams.get("inboxId");
    const inboxId = scopedInboxId ?? (requestedInboxId ? Number(requestedInboxId) : undefined);

    const conversations = await listConversations({
      ...(status ? { status } : {}),
      ...(inboxId != null ? { inboxId } : {}),
    });
    // Lets the UI hide the inbox filter dropdown for scoped (vendor) callers —
    // picking a different inbox there wouldn't change anything since
    // scopedInboxId always wins server-side anyway.
    return Response.json({ conversations, scoped: scopedInboxId != null });
  } catch (error) {
    if (error instanceof ChatwootNotConfiguredError) {
      return Response.json({ error: error.message, code: "chatwoot_not_configured" }, { status: 503 });
    }
    if (error instanceof ChatwootApiError) {
      console.error("[atendimento/conversations]", error);
      return Response.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
