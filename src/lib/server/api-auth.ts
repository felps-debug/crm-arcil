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

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Internal server error";
  return Response.json({ error: message }, { status: 500 });
}
