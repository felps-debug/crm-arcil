import { describe, expect, it } from "vitest";
import { parseMarcacao, type PontoFrac } from "./marcacao";

const caixaValida = { x: 0.3, y: 0.2, w: 0.2, h: 0.1 };

function linha(n: number): PontoFrac[] {
  return Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5 }));
}

describe("parseMarcacao", () => {
  it("retorna null sem caixa", () => {
    expect(parseMarcacao({ rota: [] })).toBeNull();
    expect(parseMarcacao(null)).toBeNull();
    expect(parseMarcacao("nao e objeto")).toBeNull();
  });

  it("rejeita caixa menor que o piso de tamanho", () => {
    expect(parseMarcacao({ caixa: { x: 0.5, y: 0.5, w: 0.01, h: 0.1 } })).toBeNull();
    expect(parseMarcacao({ caixa: { x: 0.5, y: 0.5, w: 0.1, h: 0.005 } })).toBeNull();
  });

  it("aceita marcação sem rota (aparelho sem infraestrutura desenhada)", () => {
    const m = parseMarcacao({ caixa: caixaValida });
    expect(m).not.toBeNull();
    expect(m!.rota).toEqual([]);
  });

  it("descarta um único ponto solto (toque acidental, não é caminho)", () => {
    const m = parseMarcacao({ caixa: caixaValida, rota: [{ x: 0.1, y: 0.1 }] });
    expect(m!.rota).toEqual([]);
  });

  it("aceita a reta de 2 pontos do formato anterior (arrasto único)", () => {
    const rota = [{ x: 0.5, y: 0.3 }, { x: 0.9, y: 0.3 }];
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toEqual(rota);
  });

  it("aceita um traço livre com dezenas de pontos, sem cortar", () => {
    const rota = linha(80);
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toHaveLength(80);
    expect(m!.rota).toEqual(rota);
  });

  it("aplica o teto de sanidade em traços acima de 200 pontos", () => {
    const rota = linha(350);
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toHaveLength(200);
    expect(m!.rota).toEqual(rota.slice(0, 200));
  });

  it("ignora pontos malformados dentro do traço sem descartar os válidos", () => {
    const rota = [{ x: 0.1, y: 0.1 }, { x: "bad", y: 0.2 }, { x: 0.3, y: 0.3 }] as unknown[];
    const m = parseMarcacao({ caixa: caixaValida, rota });
    expect(m!.rota).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }]);
  });
});
