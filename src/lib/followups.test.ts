import { describe, expect, it, vi } from "vitest";
import { STATUS_PENDENTE, filtrarPendentes, isFollowupPendente } from "./followups";

/** Linha disparada e sem resposta -- o único formato que é pendência de verdade. */
const disparadoSemResposta = {
  followup_sent: true,
  respondeu: false,
  status: STATUS_PENDENTE,
};

describe("isFollowupPendente", () => {
  it("conta um follow-up disparado que ficou sem resposta", () => {
    expect(isFollowupPendente(disparadoSemResposta)).toBe(true);
  });

  // A regressão que motivou este módulo: em 16/09/2026 o painel acusava 13
  // follow-ups urgentes e os treze tinham exatamente este formato -- linha de
  // fila criada junto com o lead de cobrança, que a régua nunca disparou.
  it("NÃO conta a linha de fila criada junto com o lead (step 0, nunca disparada)", () => {
    expect(
      isFollowupPendente({ followup_sent: false, respondeu: false, status: STATUS_PENDENTE }),
    ).toBe(false);
  });

  it("não conta follow-up que a régua já encerrou sem resposta", () => {
    expect(isFollowupPendente({ ...disparadoSemResposta, status: "ENCERRADO" })).toBe(false);
  });

  it("não conta follow-up que o lead respondeu", () => {
    expect(isFollowupPendente({ ...disparadoSemResposta, respondeu: true })).toBe(false);
  });

  it("trata respondeu null como sem resposta, não como respondido", () => {
    expect(isFollowupPendente({ ...disparadoSemResposta, respondeu: null })).toBe(true);
  });

  it("trata followup_sent null/ausente como não disparado", () => {
    expect(isFollowupPendente({ ...disparadoSemResposta, followup_sent: null })).toBe(false);
    expect(isFollowupPendente({ respondeu: false, status: STATUS_PENDENTE })).toBe(false);
  });

  it("não conta status ausente", () => {
    expect(isFollowupPendente({ followup_sent: true, respondeu: false, status: null })).toBe(false);
  });
});

describe("filtrarPendentes", () => {
  it("aplica no banco as mesmas três condições da versão em memória", () => {
    const chamadas: unknown[][] = [];
    const query = {
      eq: vi.fn((...args: unknown[]) => {
        chamadas.push(["eq", ...args]);
        return query;
      }),
      not: vi.fn((...args: unknown[]) => {
        chamadas.push(["not", ...args]);
        return query;
      }),
    };

    expect(filtrarPendentes(query)).toBe(query);
    expect(chamadas).toEqual([
      ["eq", "followup_sent", true],
      ["eq", "status", STATUS_PENDENTE],
      // `is not true`, não `eq false`: precisa aceitar NULL igual ao
      // `respondeu !== true` de isFollowupPendente, senão as duas divergem.
      ["not", "respondeu", "is", true],
    ]);
  });
});
