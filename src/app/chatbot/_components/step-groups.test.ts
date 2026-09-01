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

  it("Janela não pergunta condensadora — grupo Infraestrutura só tem metragem", () => {
    const infra = buildStepGroups("Janela").find((g) => g.titulo === "Infraestrutura")!;
    expect(infra.steps.map((s) => s.key)).toEqual(["metragem_infra"]);
  });

  it("Cassete separa Forro (4 campos) de Infraestrutura (4 campos, com tubulação)", () => {
    const grupos = buildStepGroups("Cassete");
    const forro = grupos.find((g) => g.titulo === "Forro")!;
    const infra = grupos.find((g) => g.titulo === "Infraestrutura")!;
    expect(forro.steps.map((s) => s.key)).toEqual(["tipo_forro", "pe_direito", "alcapao", "ponto_eletrico"]);
    expect(infra.steps.map((s) => s.key)).toEqual(["unidade_externa", "nivel_condensadora", "tubulacao", "metragem_infra"]);
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
