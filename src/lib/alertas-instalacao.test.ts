import { describe, expect, it } from "vitest";
import { alertasInstalacao, chaveDoLocal, tensaoDoProduto, LOCAIS_CONDENSADORA } from "./alertas-instalacao";

describe("chaveDoLocal", () => {
  it("converte o rótulo da tela na chave do webhook", () => {
    expect(chaveDoLocal("Telhado")).toBe("telhado");
    expect(chaveDoLocal("Chão (base)")).toBe("chao");
    expect(chaveDoLocal("Parede externa (suporte)")).toBe("parede_externa");
    expect(chaveDoLocal("qualquer coisa")).toBeNull();
    expect(chaveDoLocal(undefined)).toBeNull();
  });
  it("tem os 5 locais", () => {
    expect(LOCAIS_CONDENSADORA).toHaveLength(5);
  });
});

describe("tensaoDoProduto", () => {
  it("lê 220V/127V do nome do ERP", () => {
    expect(tensaoDoProduto("SPLIT HI-WALL 12000 BTUS INVERTER 220V")).toBe(220);
    expect(tensaoDoProduto("Split 9000 127 V frio")).toBe(127);
    expect(tensaoDoProduto("Split 9000 bivolt")).toBeNull();
    expect(tensaoDoProduto(null)).toBeNull();
  });
});

describe("alertasInstalacao", () => {
  const base = { tipo_equipamento: "Split Hi-Wall", modelo: "SPLIT 12000 220V" };
  it("sem nada fora do padrão, nenhum alerta", () => {
    expect(alertasInstalacao({ ...base, tensao: "220 V", obstaculos: "Não", dreno: "Para fora pela parede", ponto_eletrico: "Sim" })).toEqual([]);
  });
  it("tensão diferente da do aparelho", () => {
    expect(alertasInstalacao({ ...base, tensao: "127 V" })[0]).toMatch(/Tensão do ponto \(127 V\) diferente da do aparelho \(220 V\)/);
  });
  it("tensão desconhecida, obstáculo, bomba e ponto a executar", () => {
    const a = alertasInstalacao({ ...base, tensao: "Não sei", obstaculos: "Sim", dreno: "Precisa de bomba de dreno", ponto_eletrico: "Não" });
    expect(a).toHaveLength(4);
    expect(a.join(" ")).toMatch(/afastamento mínimo/);
    expect(a.join(" ")).toMatch(/bomba de dreno/);
  });
});
