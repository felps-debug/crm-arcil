import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { comporPrevia, ALTURA_PRANCHA, LARGURA_FAIXA } from "./installation-overlay";
import type { DadosOverlay } from "./previa-tipos";

/**
 * Renderiza a prancha sobre uma cena sintética: o que se testa é a camada
 * vetorial (satori + sharp), não o modelo de imagem. Com `PREVIA_DUMP=<pasta>`
 * os PNGs são gravados para inspeção visual.
 */

async function cenaSintetica(W: number, H: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b8378"/><stop offset="34%" stop-color="#6f6a63"/>
      <stop offset="35%" stop-color="#b5a48f"/><stop offset="100%" stop-color="#5c5148"/>
    </linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const BASE: DadosOverlay = {
  produto: "Ar Condicionado Split Hi-Wall 12000 BTUs Inverter 220V",
  marca: "LG",
  sku: "S3-Q12JA31A",
  tipoEquipamento: "Split Hi-Wall",
  peDireito: "2,70 m",
  alturaInstalacao: "mín. 2,00 m a 2,30 m",
  distanciaTeto: "mín. 15 cm",
  espacamentoLateral: "mín. 15 cm a 30 cm",
  tubulacao: "Embutida na parede",
  pontoEletrico: false,
  alcapao: null,
  tipoForro: null,
  metragemInfra: null,
  alturaGabineteCm: 29,
  larguraGabineteCm: 84,
  origemDimensoes: "padrao_estimado",
  produtoImagemBase64: null,
  recomendacoesGarantia: ["Tubulação frigorígena de cobre 100% isolada individualmente", "Teste de vácuo abaixo de 500 microns obrigatório"],
  unidadeExterna: "Sacada técnica",
  distanciaCondensadora: "6 m",
  nivelCondensadora: "Mesmo nível do ambiente",
  cenaCondensadoraBase64: null,
  alertas: ["Executar ponto elétrico exclusivo, com disjuntor dedicado e aterramento."],
  dreno: "Para fora pela parede",
  tensao: "220 V",
  capacidade: "12.000 BTU/h",
  marcacao: null,
  urlPrevia: "https://arcil.com.br",
  modoInfra: "modelo_3d",
};

const COM_MARCACAO: DadosOverlay = {
  ...BASE,
  marcacao: { caixa: { x: 0.38, y: 0.2, w: 0.24, h: 0.08 }, rota: [{ x: 0.62, y: 0.24 }, { x: 0.8, y: 0.2 }] },
};

async function render(nome: string, dados: DadosOverlay, W: number, H: number) {
  const saida = await comporPrevia(await cenaSintetica(W, H), dados);
  if (process.env.PREVIA_DUMP) {
    fs.mkdirSync(process.env.PREVIA_DUMP, { recursive: true });
    fs.writeFileSync(path.join(process.env.PREVIA_DUMP, `${nome}.png`), saida);
  }
  return sharp(saida).metadata();
}

describe("comporPrevia (prancha)", () => {
  it("paisagem: altura padrão, largura = cena escalada + faixa", async () => {
    const meta = await render("prancha-paisagem", COM_MARCACAO, 1536, 864);
    expect(meta.height).toBe(ALTURA_PRANCHA);
    expect(meta.width).toBe(Math.round((1536 * ALTURA_PRANCHA) / 864) + LARGURA_FAIXA);
  }, 30_000);

  it("retrato, sem marcação", async () => {
    const meta = await render("prancha-retrato-sem-marcacao", BASE, 900, 1600);
    expect(meta.height).toBe(ALTURA_PRANCHA);
    expect(meta.width).toBe(900 + LARGURA_FAIXA);
  }, 30_000);

  it("retrato com marcação de cassete (formato da prévia real de 2026-10-02)", async () => {
    const meta = await render(
      "prancha-retrato-cassete",
      { ...COM_MARCACAO, tipoEquipamento: "Cassete", peDireito: "0,80 m", marcacao: { caixa: { x: 0.33, y: 0.12, w: 0.36, h: 0.1 }, rota: [{ x: 0.3, y: 0.15 }, { x: 0.0, y: 0.16 }] } },
      730,
      912
    );
    expect(meta.height).toBe(ALTURA_PRANCHA);
  }, 30_000);

  it("com cena da condensadora", async () => {
    const cond = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a8a99" } }).jpeg().toBuffer();
    const meta = await render(
      "prancha-com-condensadora",
      { ...COM_MARCACAO, cenaCondensadoraBase64: `data:image/jpeg;base64,${cond.toString("base64")}` },
      1536,
      864
    );
    expect(meta.height).toBe(ALTURA_PRANCHA);
  }, 30_000);

  it("cassete com vários alertas não estoura a faixa", async () => {
    const meta = await render(
      "prancha-cassete",
      {
        ...COM_MARCACAO,
        tipoEquipamento: "Cassete",
        tipoForro: "Gesso",
        alcapao: true,
        alertas: ["Alerta um bem comprido para quebrar linha na faixa lateral da prancha.", "Alerta dois.", "Alerta três.", "Alerta quatro."],
        recomendacoesGarantia: ["Um", "Dois", "Três", "Quatro"],
      },
      1536,
      864
    );
    expect(meta.height).toBe(ALTURA_PRANCHA);
  }, 30_000);
});
