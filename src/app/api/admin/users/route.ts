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

    // Use admin client to read profile — bypasses RLS so it always works
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) return null;
    const role = String(profile.role);
    if (role !== "superadmin") return null;
    return user;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const caller = await requireSuperAdmin();
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });

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
    const msg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireSuperAdmin();
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json();
    const { email, password, full_name, role } = body;
    if (!email || !password || !role) {
      return Response.json({ error: "email, password e role são obrigatórios" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await admin.from("user_profiles").upsert({
      id: data.user.id,
      email,
      full_name: full_name ?? null,
      role,
      permissions: ROLE_PERMISSIONS[role] ?? {},
    });

    return Response.json({ user: data.user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
