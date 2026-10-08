import { describe, expect, it } from "vitest";
import { lerInspecao, motivoDaInspecao } from "./inspetor-cena";

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

describe("motivoDaInspecao", () => {
  it("null quando tudo confere; texto pt-BR quando não", () => {
    expect(motivoDaInspecao(OK, "Split Hi-Wall")).toBeNull();
    expect(motivoDaInspecao({ ...OK, ambiente_preservado: false, motivo: "sofá sumiu" }, "Split Hi-Wall")).toMatch(/ambiente.*sofá sumiu/i);
  });
});
