import { describe, expect, it } from "vitest";
import { shouldReloadProfile } from "./profile-loader";

describe("shouldReloadProfile", () => {
  it("primeira sessão carrega", () => {
    expect(shouldReloadProfile("INITIAL_SESSION", "u1", null)).toBe(true);
  });

  it("sessão inicial vazia não carrega", () => {
    expect(shouldReloadProfile("INITIAL_SESSION", null, null)).toBe(false);
  });

  it("renovação de token do mesmo usuário não recarrega — é o que acontece a cada volta de foco", () => {
    expect(shouldReloadProfile("TOKEN_REFRESHED", "u1", "u1")).toBe(false);
  });

  it("login e atualização de usuário recarregam", () => {
    expect(shouldReloadProfile("SIGNED_IN", "u1", null)).toBe(true);
    expect(shouldReloadProfile("USER_UPDATED", "u1", "u1")).toBe(true);
  });

  it("SIGNED_IN repetido do mesmo usuário (evento que o Supabase reemite no foco) não recarrega", () => {
    expect(shouldReloadProfile("SIGNED_IN", "u1", "u1")).toBe(false);
  });

  it("logout não carrega perfil", () => {
    expect(shouldReloadProfile("SIGNED_OUT", null, "u1")).toBe(false);
  });

  it("qualquer evento com outro usuário recarrega", () => {
    expect(shouldReloadProfile("TOKEN_REFRESHED", "u2", "u1")).toBe(true);
  });
});
