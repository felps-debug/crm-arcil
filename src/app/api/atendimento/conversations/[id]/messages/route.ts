import { NextRequest } from "next/server";
import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiPermission("manage_atendimento");
  if (response) return response;

  try {
    const { id } = await params;
    const { content } = await req.json();

    if (!content || typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    const message = await sendMessage(id, content);

    try {
      const admin = createAdminClient();
      await admin.from("activity_log").insert({
        entity_type: "atendimento_conversation",
        entity_id: String(id),
        action: "reply",
        metadata: { actor_id: user!.id },
        wf_origin: "crm",
      });
    } catch (logErr) {
      // Never fail the reply because the audit log insert failed.
      console.error("[atendimento/messages] activity_log insert falhou:", logErr);
    }

    return Response.json({ message });
  } catch (error) {
    if (error instanceof ChatwootNotConfiguredError) {
      return Response.json({ error: error.message, code: "chatwoot_not_configured" }, { status: 503 });
    }
    if (error instanceof ChatwootApiError) {
      console.error("[atendimento/messages]", error);
      return Response.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
