import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin, handleApiError } from "@/lib/server/api-auth";
import { VALID_ROLES, ROLE_PERMISSIONS, type ValidRole } from "@/lib/server/roles";

function isPlainBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "boolean");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: caller, response } = await requireSuperAdmin();
    if (response) return response;

    const { id } = await params;
    const { role, full_name, permissions, chatwoot_inbox_id } = await req.json();

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return Response.json({ error: `Role inválida. Use uma de: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }
    if (permissions !== undefined && !isPlainBooleanRecord(permissions)) {
      return Response.json({ error: "permissions deve ser um objeto de chaves booleanas" }, { status: 400 });
    }
    if (chatwoot_inbox_id !== undefined && chatwoot_inbox_id !== null && typeof chatwoot_inbox_id !== "string") {
      return Response.json({ error: "chatwoot_inbox_id deve ser string ou null" }, { status: 400 });
    }

    const admin = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (role || permissions) {
      const { data: current } = await admin.from("user_profiles").select("permissions").eq("id", id).single();
      const base = role ? ROLE_PERMISSIONS[role as ValidRole] ?? {} : (current?.permissions as Record<string, boolean>) ?? {};
      updates.permissions = permissions ? { ...base, ...permissions } : base;
    }
    if (role) updates.role = role;
    if (full_name !== undefined) updates.full_name = full_name;
    if (chatwoot_inbox_id !== undefined) updates.chatwoot_inbox_id = chatwoot_inbox_id;

    const { error } = await admin.from("user_profiles").update(updates).eq("id", id);
    if (error) return handleApiError(error);

    await admin.from("activity_log").insert({
      entity_type: "user_profile",
      entity_id: id,
      action: "update",
      metadata: { actor_id: caller!.id, changes: { role, full_name, permissions } },
      wf_origin: "crm",
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: caller, response } = await requireSuperAdmin();
    if (response) return response;

    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return handleApiError(error);

    await admin.from("activity_log").insert({
      entity_type: "user_profile",
      entity_id: id,
      action: "delete",
      metadata: { actor_id: caller!.id },
      wf_origin: "crm",
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
