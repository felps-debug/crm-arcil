import { describe, expect, it } from "vitest";
import { planoAnotacoes } from "./preview-annotations";
import type { DadosOverlay } from "./previa-tipos";
import type { Marcacao } from "@/lib/marcacao";
import { INFRA } from "@/constants/arcil-brand";

const DADOS = {
  produto: "Split Hi-Wall 18000",
  marca: "PHILCO",
  sku: null,
  tipoEquipamento: "Split Hi-Wall",
  peDireito: "2,80 m",
  distanciaTeto: "0,15 m",
  unidadeExterna: "Sacada",
} as unknown as DadosOverlay;

const MARCACAO = {
  caixa: { x: 0.4, y: 0.12, w: 0.2, h: 0.08 },
  rota: [
    { x: 0.4, y: 0.15 },
    { x: 0.25, y: 0.1 },
    { x: 0.05, y: 0.07 },
  ],
} as unknown as Marcacao;

const W = 2512;
const H = 1680;
const temFeixe = (svg: string) => svg.includes(`stroke="${INFRA.liquido.cor}"`);
const titulos = (nos: unknown[]) => JSON.stringify(nos);

describe("planoAnotacoes por modo de infraestrutura", () => {
  it("modelo_3d: CRM escreve as legendas, mas não desenha a tubulação (o modelo já desenhou em 3D)", () => {
    const plano = planoAnotacoes({ ...DADOS, modoInfra: "modelo_3d" }, MARCACAO, W, H, 1);
    expect(temFeixe(plano.linhas)).toBe(false);
    expect(titulos(plano.nos)).toContain("EVAPORADORA");
    expect(titulos(plano.nos)).toContain("LIGAÇÃO ATÉ CONDENSADORA");
  });

  it("vetorial: CRM desenha legendas e tubulação", () => {
    const plano = planoAnotacoes({ ...DADOS, modoInfra: "vetorial" }, MARCACAO, W, H, 1);
    expect(temFeixe(plano.linhas)).toBe(true);
    expect(titulos(plano.nos)).toContain("EVAPORADORA");
  });

  it("gemini_3d (legado): o modelo escreveu tudo, o CRM não desenha nada", () => {
    const plano = planoAnotacoes({ ...DADOS, modoInfra: "gemini_3d" }, MARCACAO, W, H, 1);
    expect(plano.linhas).toBe("");
    expect(plano.nos).toHaveLength(0);
  });
});
