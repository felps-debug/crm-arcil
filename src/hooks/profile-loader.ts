import type { AuthChangeEvent } from "@supabase/supabase-js";

/**
 * O perfil precisa ser buscado de novo neste evento de auth?
 *
 * O Supabase emite evento de sessão a cada volta de foco da aba
 * (TOKEN_REFRESHED, e SIGNED_IN de novo para a mesma sessão). Recarregar o
 * perfil em todos eles fazia um login gerar quatro leituras de user_profiles
 * em um segundo. Só vale buscar quando a identidade muda ou o próprio usuário
 * foi alterado.
 */
export function shouldReloadProfile(
  event: AuthChangeEvent | string,
  nextUserId: string | null,
  currentUserId: string | null
): boolean {
  if (event === "SIGNED_OUT" || !nextUserId) return false;
  if (nextUserId !== currentUserId) return true;
  return event === "USER_UPDATED";
}
