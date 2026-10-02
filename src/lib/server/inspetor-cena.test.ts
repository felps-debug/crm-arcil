import { describe, expect, it } from "vitest";
import { deveRegenerar, lerInspecao, motivoDaInspecao } from "./inspetor-cena";

const OK = {
  ambiente_preservado: true,
  infra_por_dentro: true,
  aparelho_confere: true,
  sem_texto: true,
  posicao_confere: true,
  instalacao_correta: true,
  motivo: "",
};

describe("lerInspecao", () => {
  it("aceita JSON puro e cercado por ```json", () => {
    expect(lerInspecao(JSON.stringify(OK))).toEqual(OK);
    expect(lerInspecao("```json\n" + JSON.stringify(OK) + "\n```")).toEqual(OK);
  });
  it("recusa campo faltando ou de tipo errado", () => {
    expect(lerInspecao(JSON.stringify({ ...OK, sem_texto: "sim" }))).toBeNull();
    expect(lerInspecao("não é json")).toBeNull();
  });
});

describe("deveRegenerar", () => {
  it("regenera por ambiente, infra, aparelho ou texto", () => {
    expect(deveRegenerar(OK, "Split Hi-Wall")).toBe(false);
    expect(deveRegenerar({ ...OK, sem_texto: false }, "Split Hi-Wall")).toBe(true);
    expect(deveRegenerar({ ...OK, infra_por_dentro: false }, "Split Hi-Wall")).toBe(true);
    expect(deveRegenerar({ ...OK, instalacao_correta: false }, "Cassete")).toBe(true);
  });
  it("posição errada só avisa; infra é ignorada na Janela", () => {
    expect(deveRegenerar({ ...OK, posicao_confere: false }, "Split Hi-Wall")).toBe(false);
    expect(deveRegenerar({ ...OK, infra_por_dentro: false }, "Janela")).toBe(false);
  });
});

describe("motivoDaInspecao", () => {
  it("null quando tudo confere; texto pt-BR quando não", () => {
    expect(motivoDaInspecao(OK, "Split Hi-Wall")).toBeNull();
    expect(motivoDaInspecao({ ...OK, ambiente_preservado: false, motivo: "sofá sumiu" }, "Split Hi-Wall")).toMatch(/ambiente.*sofá sumiu/i);
  });
});
