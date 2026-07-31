import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { listConversations, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function GET(request: Request) {
  const { response } = await requireApiPermission("manage_atendimento");
  if (response) return response;

  try {
    const status = new URL(request.url).searchParams.get("status");
    const conversations = await listConversations(status ? { status } : undefined);
    return Response.json({ conversations });
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
