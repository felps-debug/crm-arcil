import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ROLE_PERMISSIONS: Record<string, object> = {
  superadmin: { view_all: true, manage_users: true, manage_roles: true, manage_cobranca: true },
  owner:      { view_all: true, manage_cobranca: true },
  manager:    { view_all: true, manage_cobranca: true },
  vendor:     { view_leads: true },
  employee:   { view_leads: true },
  client:     {},
};

async function requireSuperAdmin() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).single();
    if (!profile || String(profile.role) !== "superadmin") return null;
    return user;
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireSuperAdmin();
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const { role, full_name } = await req.json();

    const admin = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (role) { updates.role = role; updates.permissions = ROLE_PERMISSIONS[role] ?? {}; }
    if (full_name !== undefined) updates.full_name = full_name;

    const { error } = await admin.from("user_profiles").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireSuperAdmin();
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
