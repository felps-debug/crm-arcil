import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { listInboxes, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

// Names only (no message content) — safe for anyone who can reach
// /atendimento, and for the admin panel's inbox picker (superadmin already
// passes requireApiPermission regardless of the manage_atendimento flag).
export async function GET() {
  const { response } = await requireApiPermission("manage_atendimento");
  if (response) return response;

  try {
    const inboxes = await listInboxes();
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
