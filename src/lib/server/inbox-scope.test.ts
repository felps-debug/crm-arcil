import { describe, expect, it } from "vitest";
import { canSeeInbox, inboxesToQuery, mergeConversationLists, parseInboxIds } from "./inbox-scope";
import type { ListaDeConversas } from "@/lib/chatwoot/client";

describe("parseInboxIds", () => {
  it("junta o vínculo antigo (texto) com a lista nova, sem repetir", () => {
    expect(parseInboxIds({ chatwoot_inbox_id: "15", chatwoot_inbox_ids: [23, 22, 15] })).toEqual([15, 23, 22]);
  });

  it("sem nada vinculado devolve lista vazia", () => {
    expect(parseInboxIds({ chatwoot_inbox_id: null, chatwoot_inbox_ids: null })).toEqual([]);
    expect(parseInboxIds({})).toEqual([]);
    expect(parseInboxIds(null)).toEqual([]);
  });

  it("ignora lixo (texto não numérico, zero, negativo)", () => {
    expect(parseInboxIds({ chatwoot_inbox_id: "abc", chatwoot_inbox_ids: [0, -1, 7] })).toEqual([7]);
  });
});

describe("canSeeInbox", () => {
  it("sem escopo (null) vê qualquer inbox", () => {
    expect(canSeeInbox(null, 99)).toBe(true);
  });
  it("com escopo só vê os da lista; inbox desconhecido (null) é negado", () => {
    expect(canSeeInbox([15, 23], 23)).toBe(true);
    expect(canSeeInbox([15, 23], 22)).toBe(false);
    expect(canSeeInbox([15, 23], null)).toBe(false);
  });
});

describe("inboxesToQuery", () => {
  it("sem escopo: respeita o filtro pedido, ou nenhum", () => {
    expect(inboxesToQuery(null, 22)).toEqual([22]);
    expect(inboxesToQuery(null, null)).toBeNull();
  });
  it("com escopo e filtro permitido: só aquele", () => {
    expect(inboxesToQuery([15, 23, 22], 23)).toEqual([23]);
  });
  it("com escopo e filtro fora da lista: ignora o pedido e usa a lista toda (não dá para ampliar pela URL)", () => {
    expect(inboxesToQuery([15, 23, 22], 8)).toEqual([15, 23, 22]);
    expect(inboxesToQuery([15, 23, 22], null)).toEqual([15, 23, 22]);
  });
});

describe("mergeConversationLists", () => {
  const conv = (id: number, at: string) => ({ id, lastActivityAt: at }) as unknown as ListaDeConversas["conversations"][number];
  const lista = (convs: ReturnType<typeof conv>[], total: number, paginas: number, temMais: boolean): ListaDeConversas => ({
    conversations: convs,
    totalNoChatwoot: total,
    paginasLidas: paginas,
    temMais,
  });

  it("ordena por atividade mais recente, soma totais e marca temMais se qualquer lista tiver", () => {
    const out = mergeConversationLists([
      lista([conv(1, "2026-10-01T10:00:00Z"), conv(2, "2026-10-01T08:00:00Z")], 30, 2, true),
      lista([conv(3, "2026-10-01T09:00:00Z")], 5, 1, false),
    ]);
    expect(out.conversations.map((c) => c.id)).toEqual([1, 3, 2]);
    expect(out.totalNoChatwoot).toBe(35);
    expect(out.paginasLidas).toBe(2);
    expect(out.temMais).toBe(true);
  });

  it("lista única passa direto", () => {
    const one = lista([conv(1, "2026-10-01T10:00:00Z")], 1, 1, false);
    expect(mergeConversationLists([one])).toEqual(one);
  });
});
