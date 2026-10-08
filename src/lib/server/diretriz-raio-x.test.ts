import { describe, expect, it } from "vitest";
import { diretrizRaioX } from "./diretriz-raio-x";

describe("diretrizRaioX", () => {
  it("cada caso de tubulação tem sua frase, sempre com a regra comum", () => {
    expect(diretrizRaioX("Split Hi-Wall", "Embutida na parede")).toMatch(/inside the wall/);
    expect(diretrizRaioX("Split Hi-Wall", "Canaleta aparente")).toMatch(/semi-transparent white PVC/);
    expect(diretrizRaioX("Cassete", "Embutidos no forro")).toMatch(/ceiling/);
    expect(diretrizRaioX("Split Hi-Wall", "Sem canaleta")).toMatch(/clamps/);
    expect(diretrizRaioX("Split Hi-Wall", null)).toMatch(/NO letters/);
  });
  it("Janela não tem infraestrutura", () => {
    expect(diretrizRaioX("Janela", null)).toBe("");
  });
});
