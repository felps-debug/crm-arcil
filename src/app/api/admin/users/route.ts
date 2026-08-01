import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin, handleApiError } from "@/lib/server/api-auth";
import { VALID_ROLES, ROLE_PERMISSIONS } from "@/lib/server/roles";

export async function GET() {
  try {
    const { response } = await requireSuperAdmin();
    if (response) return response;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return handleApiError(error);

    const { data: profiles } = await admin.from("user_profiles").select("*");
    const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id, p]));

    const result = (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      ...(profileMap.get(u.id) ?? { full_name: null, role: "employee", permissions: {} }),
    }));

    return Response.json({ users: result });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user: caller, response } = await requireSuperAdmin();
    if (response) return response;

    const body = await req.json();
    const { email, password, full_name, role } = body;
    if (!email || !password || !role) {
      return Response.json({ error: "email, password e role são obrigatórios" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return Response.json({ error: `Role inválida. Use uma de: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (error) return handleApiError(error);

    await admin.from("user_profiles").upsert({
      id: data.user.id,
      email,
      full_name: full_name ?? null,
      role,
      permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? {},
    });

    await admin.from("activity_log").insert({
      entity_type: "user_profile",
      entity_id: data.user.id,
      action: "create",
      metadata: { actor_id: caller!.id, email, role },
      wf_origin: "crm",
    });

    return Response.json({ user: data.user });
  } catch (err) {
    return handleApiError(err);
  }
}
