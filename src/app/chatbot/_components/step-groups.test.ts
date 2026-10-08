import { describe, expect, it } from "vitest";
import { buildSteps, buildStepGroups, grupoRespondido, type StepGroup } from "./step-groups";

const TIPOS = [null, "Split Hi-Wall", "Cassete", "Dutado", "Piso-teto", "Janela"];

describe("buildStepGroups", () => {
  it.each(TIPOS)("cobre exatamente as mesmas perguntas que buildSteps para tipo=%s", (tipo) => {
    const chavesFlat = buildSteps(tipo).map((s) => s.key);
    const chavesAgrupadas = buildStepGroups(tipo).flatMap((g) => g.steps.map((s) => s.key));
    expect(chavesAgrupadas).toEqual(chavesFlat);
  });

  it("cada grupo tem título e pelo menos um campo, para todo tipo", () => {
    for (const tipo of TIPOS) {
      for (const grupo of buildStepGroups(tipo)) {
        expect(grupo.titulo.length).toBeGreaterThan(0);
        expect(grupo.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("Ambiente e aparelho junta ambiente e produto na primeira tela", () => {
    const grupos = buildStepGroups(null);
    expect(grupos[0].titulo).toBe("Ambiente e aparelho");
    expect(grupos[0].steps.map((s) => s.key)).toEqual(["ambiente", "produto"]);
  });

  it("Foto e Marcação são sempre grupos de 1 campo só", () => {
    for (const tipo of TIPOS) {
      const grupos = buildStepGroups(tipo);
      const foto = grupos.find((g) => g.titulo === "Foto")!;
      const marcacao = grupos.find((g) => g.titulo === "Marcação")!;
      expect(foto.steps).toHaveLength(1);
      expect(foto.steps[0].key).toBe("foto");
      expect(marcacao.steps).toHaveLength(1);
      expect(marcacao.steps[0].key).toBe("marcacao");
    }
  });

  it("Ambiente vira escolha, sem texto livre", () => {
    const ambiente = buildSteps(null).find((s) => s.key === "ambiente")!;
    expect(ambiente.type).toBe("choice");
  });

  it("nenhum tipo pergunta unidade_externa nem metragem_infra", () => {
    for (const tipo of TIPOS) {
      const chaves = buildSteps(tipo).map((s) => s.key);
      expect(chaves).not.toContain("unidade_externa");
      expect(chaves).not.toContain("metragem_infra");
    }
  });

  it("todo tipo com condensadora separada pergunta local, distância, dreno e tensão", () => {
    for (const tipo of [null, "Split Hi-Wall", "Cassete", "Dutado", "Piso-teto"]) {
      const chaves = buildSteps(tipo).map((s) => s.key);
      for (const k of ["local_condensadora", "distancia_condensadora", "dreno", "tensao"]) expect(chaves).toContain(k);
    }
  });

  it("Janela não pergunta condensadora nem dreno, mas pergunta tensão", () => {
    const chaves = buildSteps("Janela").map((s) => s.key);
    expect(chaves).not.toContain("local_condensadora");
    expect(chaves).not.toContain("dreno");
    expect(chaves).toContain("tensao");
  });

  it("só o Hi-Wall pergunta obstáculos", () => {
    expect(buildSteps("Split Hi-Wall").map((s) => s.key)).toContain("obstaculos");
    expect(buildSteps("Cassete").map((s) => s.key)).not.toContain("obstaculos");
  });

  it("Cassete: Forro, Elétrica e dreno, Condensadora e tubulação", () => {
    const grupos = buildStepGroups("Cassete").slice(3);
    expect(grupos.map((g) => g.titulo)).toEqual(["Forro", "Elétrica e dreno", "Condensadora e tubulação"]);
  });
});

describe("grupoRespondido", () => {
  const grupo: StepGroup = {
    titulo: "Teste",
    steps: [
      { key: "a", question: "?", type: "text" },
      { key: "foto", question: "?", type: "file" },
    ],
  };

  it("false se algum campo de texto está vazio", () => {
    expect(grupoRespondido(grupo, {}, { temFoto: true, marcacaoRespondida: true })).toBe(false);
  });

  it("false se o widget de foto não sinaliza resposta, mesmo com o texto preenchido", () => {
    expect(grupoRespondido(grupo, { a: "x" }, { temFoto: false, marcacaoRespondida: true })).toBe(false);
  });

  it("true quando texto e widgets estão todos respondidos", () => {
    expect(grupoRespondido(grupo, { a: "x" }, { temFoto: true, marcacaoRespondida: true })).toBe(true);
  });
});
