import { describe, expect, it } from "vitest";
import { nomeComMarca, semPontoFinal } from "./texto-previa";

describe("semPontoFinal", () => {
  it("tira a pontuação que o vendedor digitou no fim", () => {
    expect(semPontoFinal("Ao lado na sacada.")).toBe("Ao lado na sacada");
    expect(semPontoFinal("Ao lado na sacada.. ")).toBe("Ao lado na sacada");
    expect(semPontoFinal("mín. 15 cm")).toBe("mín. 15 cm");
  });
});

describe("nomeComMarca", () => {
  it("põe a marca uma vez só, na frente", () => {
    expect(nomeComMarca("SPLIT HI WALL 12000 FRIO PHILCO INVERTER QUADRADA", "PHILCO")).toBe(
      "PHILCO SPLIT HI WALL 12000 FRIO INVERTER QUADRADA"
    );
    expect(nomeComMarca("SPRINGER MIDEA SPLIT CASSETE", "SPRINGER MIDEA")).toBe("SPRINGER MIDEA SPLIT CASSETE");
    expect(nomeComMarca("Split 9000", "LG")).toBe("LG Split 9000");
    expect(nomeComMarca("Split 9000", null)).toBe("Split 9000");
  });

  it("não apaga a marca de dentro de outra palavra", () => {
    expect(nomeComMarca("SPLIT LGX 9000", "LG")).toBe("LG SPLIT LGX 9000");
  });
});
