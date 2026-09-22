import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** O que as rotas usam do usuário autenticado — só id e e-mail. */
export type ApiUser = { id: string; email: string | null };

export type AuthOptions = {
  /**
   * Confirma a sessão no Auth server (`getUser`) em vez de só verificar a
   * assinatura do JWT (`getClaims`). Use em toda rota que MUDA algo: uma
   * sessão encerrada continua com JWT de assinatura válida até ele expirar
   * (1h), e só o Auth server sabe que ela foi revogada.
   */
  strict?: boolean;
};

export type ApiContext = {
  userId: string;
  role: string;
  permissions: Record<string, boolean>;
};

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const forbidden = () => Response.json({ error: "Sem permissão" }, { status: 403 });

/**
 * Identidade verificada da request.
 *
 * O projeto assina o JWT com ES256 (chave assimétrica), então `getClaims()`
 * valida a assinatura localmente com o JWKS em cache — sem a ida e volta ao
 * Auth server que `getUser()` faz. Isso é o que estava sendo repetido em cada
 * rota do dashboard. `getSession()` nunca serve aqui: ele devolve o que está no
 * cookie sem verificar assinatura nenhuma.
 */
async function verifiedUser(opts?: AuthOptions): Promise<ApiUser | null> {
  const supabase = await createClient();

  if (opts?.strict) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email ?? null };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
}

async function loadProfile(userId: string) {
  const { data } = await createAdminClient()
    .from("user_profiles")
    .select("role,permissions,chatwoot_inbox_id")
    .eq("id", userId)
    .single();
  return data;
}

export function isStaff(ctx: Pick<ApiContext, "role">) {
  return Boolean(ctx.role) && ctx.role !== "client";
}

/** Mesma regra de requireApiPermission: owner/superadmin passam sempre. */
export function canManage(ctx: Pick<ApiContext, "role" | "permissions">, permission: string) {
  return ["superadmin", "owner"].includes(ctx.role) || ctx.permissions?.[permission] === true;
}

export function isSuperAdmin(ctx: Pick<ApiContext, "role">) {
  return ctx.role === "superadmin";
}

/**
 * Identidade + perfil resolvidos UMA vez por request. Para rotas que
 * decidem permissão por partes da resposta (ex.: o snapshot do dashboard, onde
 * cada seção tem sua regra) sem pagar auth e perfil de novo por seção.
 */
export async function resolveApiContext(
  opts?: AuthOptions
): Promise<{ ctx: ApiContext; response: null } | { ctx: null; response: Response }> {
  const user = await verifiedUser(opts);
  if (!user) return { ctx: null, response: unauthorized() };

  const profile = await loadProfile(user.id);
  return {
    ctx: {
      userId: user.id,
      role: String(profile?.role ?? ""),
      permissions: (profile?.permissions as Record<string, boolean> | null) ?? {},
    },
    response: null,
  };
}

export async function requireApiUser(opts?: AuthOptions) {
  const user = await verifiedUser(opts);
  if (!user) return { user: null, response: unauthorized() };
  return { user, response: null };
}

/**
 * Requires an authenticated user whose role is owner/superadmin, or who holds
 * the given permission flag in user_profiles.permissions. Mirrors the
 * client-side AccessGuard(perm) check — that component only gates the UI,
 * this is the real server-side enforcement.
 */
export async function requireApiPermission(permission: string, opts?: AuthOptions) {
  const { user, response } = await requireApiUser(opts);
  if (response) return { user: null, response };

  const profile = await loadProfile(user!.id);
  const ctx = { role: String(profile?.role ?? ""), permissions: profile?.permissions ?? {} };
  if (!canManage(ctx, permission)) return { user: null, response: forbidden() };

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
export async function requireStaffUser(opts?: AuthOptions) {
  const { user, response } = await requireApiUser(opts);
  if (response) return { user: null, response };

  const profile = await loadProfile(user!.id);
  if (!isStaff({ role: String(profile?.role ?? "") })) return { user: null, response: forbidden() };

  return { user: user!, response: null };
}

/**
 * Requires role === "superadmin". Used by the /api/admin/users routes.
 * Sempre strict: é a porta de gestão de usuários, e uma sessão revogada de
 * superadmin não pode continuar mexendo em papéis até o JWT expirar.
 */
export async function requireSuperAdmin() {
  const { user, response } = await requireApiUser({ strict: true });
  if (response) return { user: null, response };

  const profile = await loadProfile(user!.id);
  if (!profile || !isSuperAdmin({ role: String(profile.role) })) {
    return { user: null, response: Response.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  return { user: user!, response: null };
}

/**
 * Requires manage_atendimento, then resolves how far this caller's view of
 * Chatwoot should reach. superadmin/owner/manager see every inbox
 * (scopedInboxId: null). Everyone else (a vendor/employee an admin granted
 * the permission to) is locked to the single Chatwoot inbox an admin linked
 * on their profile (user_profiles.chatwoot_inbox_id) — if that's not set
 * yet, they get a distinct error code so the UI can say "ask an admin to
 * link your number" instead of a generic failure.
 */
export async function requireAtendimentoScope(opts?: AuthOptions) {
  const { user, response } = await requireApiPermission("manage_atendimento", opts);
  if (response) return { user: null, scopedInboxId: null as number | null, response };

  const profile = await loadProfile(user!.id);
  const role = String(profile?.role ?? "");

  if (["superadmin", "owner", "manager"].includes(role)) {
    return { user: user!, scopedInboxId: null as number | null, response: null };
  }

  const inboxId = profile?.chatwoot_inbox_id ? Number(profile.chatwoot_inbox_id) : null;
  if (!inboxId) {
    return {
      user: null,
      scopedInboxId: null as number | null,
      response: Response.json(
        { error: "Seu usuário ainda não está vinculado a um número do Chatwoot.", code: "chatwoot_inbox_not_linked" },
        { status: 403 }
      ),
    };
  }

  return { user: user!, scopedInboxId: inboxId, response: null };
}

export function handleApiError(error: unknown) {
  // Full error stays server-side only — returning error.message to the client
  // leaks Postgres/internal details (constraint names, column names, etc).
  console.error("[api]", error);
  return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
}
