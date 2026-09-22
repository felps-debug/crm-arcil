import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { getClaims: vi.fn(), getUser: vi.fn() };
const profileQuery = { single: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => profileQuery }) }),
  }),
}));

const { canManage, isStaff, isSuperAdmin, requireApiPermission, requireApiUser, resolveApiContext } = await import(
  "./api-auth"
);

beforeEach(() => {
  vi.clearAllMocks();
  profileQuery.single.mockResolvedValue({ data: { role: "vendor", permissions: {} } });
});

describe("regras de papel", () => {
  it("isStaff barra client e papel vazio", () => {
    expect(isStaff({ role: "client" })).toBe(false);
    expect(isStaff({ role: "" })).toBe(false);
    expect(isStaff({ role: "vendor" })).toBe(true);
  });

  it("canManage: owner/superadmin passam sem flag, os demais só com a flag", () => {
    expect(canManage({ role: "owner", permissions: {} }, "manage_estoque")).toBe(true);
    expect(canManage({ role: "superadmin", permissions: {} }, "manage_estoque")).toBe(true);
    expect(canManage({ role: "vendor", permissions: { manage_estoque: true } }, "manage_estoque")).toBe(true);
    expect(canManage({ role: "manager", permissions: {} }, "manage_estoque")).toBe(false);
  });

  it("isSuperAdmin", () => {
    expect(isSuperAdmin({ role: "superadmin" })).toBe(true);
    expect(isSuperAdmin({ role: "owner" })).toBe(false);
  });
});

describe("verificação de identidade", () => {
  it("sem claims válidos devolve 401", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const { ctx, response } = await resolveApiContext();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(401);
  });

  it("claims válidos resolvem o contexto com papel vindo do banco, não do JWT", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "a@b.c", role: "authenticated" } }, error: null });
    profileQuery.single.mockResolvedValue({ data: { role: "owner", permissions: { manage_estoque: true } } });
    const { ctx } = await resolveApiContext();
    expect(ctx).toEqual({ userId: "u1", role: "owner", permissions: { manage_estoque: true } });
  });

  it("leitura usa getClaims e não vai ao Auth server", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    await requireApiUser();
    expect(auth.getClaims).toHaveBeenCalledTimes(1);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("strict usa getUser e não getClaims", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    const { user } = await requireApiUser({ strict: true });
    expect(user).toEqual({ id: "u1", email: "a@b.c" });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("strict com sessão revogada devolve 401", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("session revoked") });
    const { response } = await requireApiUser({ strict: true });
    expect(response?.status).toBe(401);
  });

  it("requireApiPermission nega vendor sem a flag", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    const { response } = await requireApiPermission("manage_estoque");
    expect(response?.status).toBe(403);
  });
});
