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
      decisions: [{ empresa: "PHBLd", documento: "B1 123", status: "pago", note: null }],
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
