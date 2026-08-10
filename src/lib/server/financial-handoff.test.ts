import { describe, expect, it } from "vitest";
import { parseFinancialHandoffPayload } from "./financial-handoff";

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
