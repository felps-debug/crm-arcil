import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { comporPrevia } from "./installation-overlay";
import type { DadosOverlay } from "./previa-tipos";

/**
 * Renderiza a camada técnica sobre uma cena sintética.
 *
 * Existe porque a única forma de conferir este pipeline até aqui era gastar uma
 * geração real do Gemini para olhar o resultado. Aqui a "cena" é um degradê
 * feito na hora: o que se testa é a camada vetorial (satori + sharp), que é
 * onde moram os erros de layout, não o modelo de imagem.
 *
 * Com `PREVIA_DUMP=<pasta>` os PNGs são gravados para inspeção visual. Sem a
 * variável, o teste só verifica que a composição não quebra e sai no tamanho
 * certo — que é o que interessa em CI.
 */

async function cenaSintetica(W: number, H: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b8378"/><stop offset="34%" stop-color="#6f6a63"/>
      <stop offset="35%" stop-color="#b5a48f"/><stop offset="100%" stop-color="#5c5148"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const BASE: DadosOverlay = {
  produto: "Ar Condicionado Split Cassete 4 Vias 24000 BTUs Inverter Quente/Frio",
  marca: "LG",
  sku: "AT-W24GPLP0",
  tipoEquipamento: "Cassete",
  peDireito: "2,70 m",
  alturaInstalacao: "conforme manual do fabricante",
  distanciaTeto: "0,30 m",
  espacamentoLateral: "mín. 1,00 m de paredes e luminárias",
  tubulacao: "Embutidos no forro",
  pontoEletrico: false,
  alcapao: true,
  tipoForro: "Gesso",
  metragemInfra: "6 m",
  alturaGabineteCm: 26,
  larguraGabineteCm: 84,
  origemDimensoes: "padrao_estimado",
  produtoImagemBase64: null,
  recomendacoesGarantia: [
    "Respeitar inclinação do dreno",
    "Evitar dobras na tubulação",
    "Prever acesso para manutenção",
    "Conferir fixação e nivelamento",
    "Validar ponto elétrico compatível",
  ],
  unidadeExterna: "Área técnica externa, cerca de 8 m",
  nivelCondensadora: "Mesmo nivel do ambiente",
  capacidade: "24.000 BTU/h",
  marcacao: null,
  urlPrevia: "https://swcqvrowqwylcegrcesu.supabase.co/storage/v1/object/public/PDF/previa/teste.jpg",
};

const COM_MARCACAO: DadosOverlay = {
  ...BASE,
  marcacao: {
    caixa: { x: 0.38, y: 0.26, w: 0.24, h: 0.075 },
    rota: [
      { x: 0.6, y: 0.28 },
      { x: 0.74, y: 0.22 },
      { x: 0.88, y: 0.2 },
      { x: 1.0, y: 0.19 },
    ],
  },
};

async function render(nome: string, dados: DadosOverlay, W: number, H: number) {
  const saida = await comporPrevia(await cenaSintetica(W, H), dados);
  const destino = process.env.PREVIA_DUMP;
  if (destino) {
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, `${nome}.png`), saida);
  }
  return sharp(saida).metadata();
}

describe("comporPrevia", () => {
  it("compõe a camada ancorada no mesmo tamanho da cena", async () => {
    const meta = await render("ancorado-cassete", COM_MARCACAO, 1536, 864);
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(864);
  }, 30_000);

  it("compõe a camada ancorada de hi-wall com o aparelho encostado na direita", async () => {
    const meta = await render("ancorado-hiwall-direita", {
      ...COM_MARCACAO,
      tipoEquipamento: "Split Hi-Wall",
      produto: "Ar Condicionado Split Hi-Wall 12000 BTUs Inverter",
      distanciaTeto: "0,15 m",
      capacidade: "12.000 BTU/h",
      alcapao: null,
      marcacao: {
        caixa: { x: 0.66, y: 0.24, w: 0.22, h: 0.07 },
        rota: [
          { x: 0.66, y: 0.3 },
          { x: 0.5, y: 0.36 },
          { x: 0.3, y: 0.4 },
          { x: 0.0, y: 0.44 },
        ],
      },
    }, 1536, 864);
    expect(meta.width).toBe(1536);
  }, 30_000);

  it("cai no layout de cards quando o vendedor pula a marcação", async () => {
    const meta = await render("cards-sem-marcacao", BASE, 1536, 864);
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(864);
  }, 30_000);

  it("compõe a camada ancorada em modoInfra=modelo_3d (padrão): legendas vetoriais, tubulação do modelo", async () => {
    const meta = await render("ancorado-modelo3d", { ...COM_MARCACAO, modoInfra: "modelo_3d" }, 1536, 864);
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(864);
  }, 30_000);

  it("compõe a camada ancorada em modoInfra=gemini_3d sem desenhar callout vetorial duplicado", async () => {
    const meta = await render("ancorado-gemini3d", { ...COM_MARCACAO, modoInfra: "gemini_3d" }, 1536, 864);
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(864);
  }, 30_000);
});
