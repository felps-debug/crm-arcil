import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin, handleApiError } from "@/lib/server/api-auth";

const REMOVED_LABEL = "[removido]";

/**
 * LGPD Art. 18 deletion/anonymization endpoint.
 *
 * A hard delete would cascade through conversations, messages, quotes, sales
 * and billing (all FK'd to leads.id) and destroy financial/audit records that
 * must be retained. Instead we anonymize the lead's PII in place — the row
 * and its id stay so every FK reference remains valid — and log the action
 * to activity_log for audit purposes.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: caller, response } = await requireSuperAdmin();
    if (response) return response;

    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("leads")
      .update({
        name: REMOVED_LABEL,
        company: REMOVED_LABEL,
        owner_name: REMOVED_LABEL,
        legal_name: REMOVED_LABEL,
        wa_phone: `removido-${id}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return handleApiError(error);
    if (!data) return Response.json({ error: "Lead not found" }, { status: 404 });

    await admin.from("activity_log").insert({
      entity_type: "lead",
      entity_id: id,
      action: "lgpd_anonymize",
      metadata: { actor_id: caller!.id },
      wf_origin: "crm",
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
