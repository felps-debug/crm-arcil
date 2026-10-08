import type { ListaDeConversas } from "@/lib/chatwoot/client";

/**
 * Quais inboxes do Chatwoot um usuário sem papel de gestão pode ver.
 *
 * Vem de duas colunas de user_profiles: `chatwoot_inbox_id` (texto, o vínculo
 * antigo, um só) e `chatwoot_inbox_ids` (lista). As duas valem juntas, para o
 * vínculo antigo continuar funcionando sem migração de dados.
 */
export function parseInboxIds(
  profile: { chatwoot_inbox_id?: string | null; chatwoot_inbox_ids?: number[] | null } | null | undefined
): number[] {
  const candidatos = [Number(profile?.chatwoot_inbox_id), ...(profile?.chatwoot_inbox_ids ?? [])];
  return [...new Set(candidatos.filter((n) => Number.isInteger(n) && n > 0))];
}

/** `scoped` null = sem restrição de inbox. */
export function canSeeInbox(scoped: number[] | null, inboxId: number | null): boolean {
  if (scoped === null) return true;
  return inboxId !== null && scoped.includes(inboxId);
}

/**
 * Inboxes a consultar numa listagem. O filtro vindo da URL só estreita: pedir
 * um inbox fora da lista cai na lista inteira, nunca em um inbox alheio.
 * null = sem restrição nenhuma (nem filtro nem escopo).
 */
export function inboxesToQuery(scoped: number[] | null, requested: number | null): number[] | null {
  if (scoped === null) return requested !== null ? [requested] : null;
  return requested !== null && scoped.includes(requested) ? [requested] : scoped;
}

/** Junta as listas de vários inboxes numa só, mais recente primeiro. */
export function mergeConversationLists(listas: ListaDeConversas[]): ListaDeConversas {
  if (listas.length === 1) return listas[0];
  return {
    conversations: listas
      .flatMap((l) => l.conversations)
      .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")),
    totalNoChatwoot: listas.reduce((soma, l) => soma + l.totalNoChatwoot, 0),
    paginasLidas: Math.max(0, ...listas.map((l) => l.paginasLidas)),
    temMais: listas.some((l) => l.temMais),
  };
}
