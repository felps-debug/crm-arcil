import { describe, expect, it } from "vitest";
import { classifyFinancialHandoff, parseFinancialHandoffPayload } from "./financial-handoff";

describe("parseFinancialHandoffPayload", () => {
  it("rejects a destination outside the two explicit return paths", () => {
    expect(() => parseFinancialHandoffPayload({ destination: "pago", decisions: [] })).toThrow("Destino inválido");
  });

  it("requires an observation for a renegotiated boleto", () => {
    expect(() => parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBLd", documento: "B1 123", status: "renegociado" }],
    })).toThrow("Informe a observação da renegociação");
  });

  it("normalizes valid paid decisions and omits empty notes", () => {
    expect(parseFinancialHandoffPayload({
      destination: "sem_retorno",
      decisions: [{ empresa: " PHBLd ", documento: " B1 123 ", status: "pago", note: "   " }],
    })).toEqual({
      destination: "sem_retorno",
      decisions: [{ empresa: "PHBLd", documento: "B1 123", status: "pago", note: null, promisedAt: null }],
    });
  });

  it("rejects a boleto without an immutable document identity", () => {
    expect(() => parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBLd", documento: "", status: "pago" }],
    })).toThrow("Boleto inválido");
  });
});

describe("classifyFinancialHandoff", () => {
  it("prioritizes resolved when no boleto remains open", () => {
    expect(classifyFinancialHandoff({ handoffAcceptedAt: "2026-08-10T10:00:00Z", resolution: null, openBoletoCount: 0 })).toBe("resolved");
  });

  it("keeps sem retorno in awaiting return until the scheduler finishes it", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: "2026-08-10T10:00:00Z",
      resolution: { destination: "sem_retorno", recordedAt: "2026-08-10T11:00:00Z", followupStatus: "scheduled" },
      openBoletoCount: 1,
    })).toBe("awaiting_return");
  });

  it("shows an accepted handoff as human work when it is newer than the last resolution", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: "2026-08-10T12:00:00Z",
      resolution: { destination: "devolver_ao_bot", recordedAt: "2026-08-10T11:00:00Z", followupStatus: "not_applicable" },
      openBoletoCount: 1,
    })).toBe("human");
  });
});

/* ── Renegociado nao e resolvido, juridico nao e quitado ──────────────────────
   Em 17/09/2026 o financeiro marcou um boleto de R$ 687,43 como renegociado
   ("vai pagar dia 10/10 / VERIFICAR PARA NAO ESQUECER") e o card foi pra
   RESOLVIDO com "R$ 0,00 / 0 boletos em aberto". Somado ao caso do Sergio
   (R$ 1.896,90 com o advogado), eram R$ 2.584,33 de divida viva invisiveis. */

function amanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function ontem() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe("parseFinancialHandoffPayload — renegociado e jurídico", () => {
  it("exige data prometida na renegociação", () => {
    expect(() => parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBMa", documento: "CxPhM 857 1/1", status: "renegociado", note: "paga dia 10/10" }],
    })).toThrow("Informe a data prometida da renegociação");
  });

  it("recusa data prometida no passado", () => {
    expect(() => parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBMa", documento: "CxPhM 857 1/1", status: "renegociado", note: "ok", promisedAt: ontem() }],
    })).toThrow("A data prometida não pode estar no passado");
  });

  it("aceita renegociação completa", () => {
    const data = amanha();
    expect(parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBMa", documento: "CxPhM 857 1/1", status: "renegociado", note: " paga dia 10/10 ", promisedAt: data }],
    })).toEqual({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBMa", documento: "CxPhM 857 1/1", status: "renegociado", note: "paga dia 10/10", promisedAt: data }],
    });
  });

  it("exige observação no caso jurídico, mas não data", () => {
    expect(() => parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBLd", documento: "CxPhL 833 1/1", status: "juridico" }],
    })).toThrow("Informe a observação do caso jurídico");

    expect(parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBLd", documento: "CxPhL 833 1/1", status: "juridico", note: "Negociação com a Advogada" }],
    })).toEqual({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBLd", documento: "CxPhL 833 1/1", status: "juridico", note: "Negociação com a Advogada", promisedAt: null }],
    });
  });

  it("descarta data prometida em boleto pago", () => {
    const resultado = parseFinancialHandoffPayload({
      destination: "devolver_ao_bot",
      decisions: [{ empresa: "PHBMa", documento: "B1 1", status: "pago", promisedAt: amanha() }],
    });
    expect(resultado.decisions[0].promisedAt).toBeNull();
  });
});

describe("classifyFinancialHandoff — dívida viva não vira resolvido", () => {
  it("manda renegociado para aguardando retorno, não para resolvido", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: "2026-09-17T12:00:00Z",
      resolution: { destination: "devolver_ao_bot", recordedAt: "2026-09-17T18:20:00Z", followupStatus: "not_applicable" },
      openBoletoCount: 1,
      activeDecisions: [{ status: "renegociado" }],
    })).toBe("awaiting_return");
  });

  it("manda jurídico para a coluna própria — nem cobrança nem resolvido", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: "2026-09-15T12:00:00Z",
      resolution: { destination: "devolver_ao_bot", recordedAt: "2026-09-15T18:50:00Z", followupStatus: "not_applicable" },
      openBoletoCount: 3,
      activeDecisions: [{ status: "juridico" }],
    })).toBe("juridico");
  });

  it("jurídico ganha de renegociado quando os dois existem no mesmo lead", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: null,
      resolution: null,
      openBoletoCount: 2,
      activeDecisions: [{ status: "renegociado" }, { status: "juridico" }],
    })).toBe("juridico");
  });

  it("só considera resolvido quando não sobra boleto em aberto", () => {
    expect(classifyFinancialHandoff({
      handoffAcceptedAt: "2026-09-17T12:00:00Z",
      resolution: null,
      openBoletoCount: 0,
      activeDecisions: [{ status: "pago" }],
    })).toBe("resolved");
  });
});
