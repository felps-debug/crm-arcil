import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireApiUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, response: null };
}

/**
 * Requires an authenticated user whose role is owner/superadmin, or who holds
 * the given permission flag in user_profiles.permissions. Mirrors the
 * client-side AccessGuard(perm) check — that component only gates the UI,
 * this is the real server-side enforcement.
 */
export async function requireApiPermission(permission: string) {
  const { user, response } = await requireApiUser();
  if (response) return { user: null, response };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("user_profiles").select("role,permissions").eq("id", user!.id).single();
  const role = String(profile?.role ?? "");
  const allowed = ["superadmin", "owner"].includes(role) || profile?.permissions?.[permission] === true;

  if (!allowed) {
    return { user: null, response: Response.json({ error: "Sem permissão" }, { status: 403 }) };
  }

  return { user: user!, response: null };
}

/**
 * Requires an authenticated user whose role is not "client" — mirrors the
 * AGENTS.md role matrix, where every internal role (vendor/employee/manager/
 * owner/superadmin) has at least "Visualização de leads" and client is
 * "Restrito". Use for endpoints that return lead/vendor detail by id, where
 * requireApiUser() alone would let a client account pull any record by
 * guessing/enumerating ids.
 */
export async function requireStaffUser() {
  const { user, response } = await requireApiUser();
  if (response) return { user: null, response };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user!.id).single();
  const role = String(profile?.role ?? "");

  if (role === "client" || !role) {
    return { user: null, response: Response.json({ error: "Sem permissão" }, { status: 403 }) };
  }

  return { user: user!, response: null };
}

/** Requires role === "superadmin". Used by the /api/admin/users routes. */
export async function requireSuperAdmin() {
  const { user, response } = await requireApiUser();
  if (response) return { user: null, response };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user!.id).single();
  if (!profile || String(profile.role) !== "superadmin") {
    return { user: null, response: Response.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  return { user: user!, response: null };
}

export function handleApiError(error: unknown) {
  // Full error stays server-side only — returning error.message to the client
  // leaks Postgres/internal details (constraint names, column names, etc).
  console.error("[api]", error);
  return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
}
