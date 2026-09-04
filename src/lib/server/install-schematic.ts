import type { DadosOverlay } from "./previa-tipos";

/**
 * Mini-esquema de instalação — substitui a foto do produto no card
 * "EQUIPAMENTO". Não é foto nem IA: é um desenho técnico pequeno e fixo
 * (não depende de detectar posição em nenhuma foto, então nunca sai torto
 * nem em lugar aleatório) mostrando onde o aparelho vai, as cotas reais
 * (vindas de `HVAC_STANDARDS` via `DadosOverlay`, nunca inventadas) e por
 * onde sai tubulação/dreno/cabo — o suficiente pra não perder garantia,
 * sem prometer ser retrato fiel do ambiente do cliente.
 *
 * O SVG aqui NUNCA usa `<text>`: satori rasteriza uma `<img>` de SVG embutido
 * por um caminho que não recebe a lista de fontes passada a `satori()` — foi
 * exatamente isso que fez `<text>` em SVG sair em branco antes
 * (watermarkImage, ver installation-overlay.ts). Todo texto aqui é devolvido
 * à parte, em `esquemaRotulos()`, como fração de posição — quem chama desenha
 * como nó satori de verdade (fonte local, sempre nítido).
 *
 * Física de instalação difere por tipo, igual já valia pro corte técnico
 * antigo (cutaway-diagram.ts, hoje sem uso):
 *  - forro (cassete, dutado): mora no forro, vão/plenum acima.
 *  - parede (hi-wall, piso-teto): monta na parede/piso.
 *  - monobloco (janela): peça única no vão, sem tubulação exposta.
 */

const CLARO = "#F2F6FC";
const CINZA = "#7C8CA6";
const AZUL = "#4EA1FF";
const AMARELO = "#F5C542";
const COBRE = "#D97B3F";

export const ESQUEMA_W = 176;
export const ESQUEMA_H = 118;

export type RotuloEsquema = { texto: string; xFrac: number; yFrac: number; cor: string; tamanho: number; ancora: "left" | "center" | "right" };

function seta(x: number, y1: number, y2: number, cor = CLARO): string {
  const cauda = Math.abs(y2 - y1) * 0.22;
  const sinal = Math.sign(y2 - y1) || 1;
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${cor}" stroke-width="1.3"/>` +
    `<path d="M ${x - 3.5} ${y1 + sinal * cauda} L ${x} ${y1} L ${x + 3.5} ${y1 + sinal * cauda}" fill="none" stroke="${cor}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M ${x - 3.5} ${y2 - sinal * cauda} L ${x} ${y2} L ${x + 3.5} ${y2 - sinal * cauda}" fill="none" stroke="${cor}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function feixe(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const linha = (off: number, cor: string, largura: number) =>
    `<line x1="${x1 + nx * off}" y1="${y1 + ny * off}" x2="${x2 + nx * off}" y2="${y2 + ny * off}" stroke="${cor}" stroke-width="${largura}" stroke-linecap="round"/>`;
  return linha(-2.6, AZUL, 1.4) + linha(0, COBRE, 1.8) + linha(2.6, AMARELO, 1.1);
}

type Familia = "forro" | "parede" | "monobloco";

function familiaDe(tipoEquipamento: string): Familia {
  const t = tipoEquipamento.trim().toLowerCase();
  if (t === "cassete" || t === "dutado") return "forro";
  if (t === "janela") return "monobloco";
  return "parede";
}

const fr = (x: number, w = ESQUEMA_W) => x / w;

function esquemaForro(d: DadosOverlay): { svg: string; rotulos: RotuloEsquema[] } {
  const tetoY = 12;
  const equipY1 = 32;
  const equipY2 = 48;
  const equipX1 = ESQUEMA_W / 2 - 26;
  const equipX2 = ESQUEMA_W / 2 + 26;
  const folga = 9; // afastamento lateral desenhado — ilustra a cota real, não um valor à parte

  const svg =
    // Gesso levemente translúcido: uma placa semi-transparente entre o teto
    // e o aparelho, pra ler como "olhando por dentro do forro" (raio-X),
    // não uma caixa opaca escondendo tudo.
    `<rect x="6" y="${tetoY}" width="${ESQUEMA_W - 12}" height="${equipY2 - tetoY + 8}" rx="3" fill="${CLARO}" fill-opacity="0.06" stroke="${CINZA}" stroke-width="1" stroke-dasharray="2 3"/>` +
    `<line x1="10" y1="${tetoY}" x2="${ESQUEMA_W - 10}" y2="${tetoY}" stroke="${CINZA}" stroke-width="1.2"/>` +
    seta(ESQUEMA_W / 2, tetoY, equipY1, AZUL) +
    // Cota lateral real (não só legenda embaixo): duas setas curtas coladas
    // no aparelho, mesma folga visual dos dois lados — a distância mínima de
    // parede/lustre vira desenho, não só texto solto no rodapé.
    `<path d="M ${equipX1 - folga} ${(equipY1 + equipY2) / 2 - 4} l 0 8 M ${equipX1 - folga} ${(equipY1 + equipY2) / 2} l ${folga - 2} 0" fill="none" stroke="${AMARELO}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M ${equipX2 + folga} ${(equipY1 + equipY2) / 2 - 4} l 0 8 M ${equipX2 + folga} ${(equipY1 + equipY2) / 2} l ${-(folga - 2)} 0" fill="none" stroke="${AMARELO}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<rect x="${equipX1}" y="${equipY1}" width="${equipX2 - equipX1}" height="${equipY2 - equipY1}" rx="2" fill="#12203a" fill-opacity="0.92" stroke="${AZUL}" stroke-width="1.4"/>` +
    feixe(equipX2, equipY1 + 4, ESQUEMA_W - 14, equipY1 - 6) +
    `<circle cx="${equipX1 + 6}" cy="${equipY2 + 2}" r="3" fill="${AZUL}"/>` +
    `<path d="M ${equipX2 - 8} ${equipY2 + 1} l 3 4 l -2 5 l 3 4" fill="none" stroke="${AMARELO}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;

  const rotulos: RotuloEsquema[] = [
    { texto: "FORRO (visão interna)", xFrac: fr(ESQUEMA_W / 2), yFrac: fr(tetoY - 4, ESQUEMA_H), cor: CINZA, tamanho: 6.5, ancora: "center" },
    { texto: d.distanciaTeto, xFrac: fr(ESQUEMA_W / 2 + 10), yFrac: fr((tetoY + equipY1) / 2 + 2, ESQUEMA_H), cor: CLARO, tamanho: 7, ancora: "left" },
    { texto: d.espacamentoLateral, xFrac: fr(ESQUEMA_W / 2), yFrac: fr(ESQUEMA_H - 5, ESQUEMA_H), cor: CINZA, tamanho: 6.5, ancora: "center" },
  ];
  return { svg, rotulos };
}

function esquemaParede(d: DadosOverlay): { svg: string; rotulos: RotuloEsquema[] } {
  const paredeX = 22;
  const equipY1 = 22;
  const equipY2 = 38;
  const equipX2 = 84;

  const svg =
    `<line x1="${paredeX}" y1="8" x2="${paredeX}" y2="${ESQUEMA_H - 10}" stroke="${CINZA}" stroke-width="1.2"/>` +
    `<line x1="10" y1="${ESQUEMA_H - 10}" x2="${ESQUEMA_W - 10}" y2="${ESQUEMA_H - 10}" stroke="${CINZA}" stroke-width="1.2"/>` +
    `<rect x="${paredeX}" y="${equipY1}" width="${equipX2 - paredeX}" height="${equipY2 - equipY1}" rx="2" fill="#12203a" stroke="${AZUL}" stroke-width="1.4"/>` +
    seta(equipX2 + 14, 8, equipY1, AZUL) +
    seta(paredeX - 12, equipY1, equipY2, AMARELO) +
    feixe(equipX2, equipY2 - 4, ESQUEMA_W - 20, ESQUEMA_H - 10);

  // espacamentoLateral pode ser uma frase longa ("mín. 1,0 m de paredes e
  // lustres") — colada perto da parede (borda esquerda do quadro) ela
  // estourava pra fora do card. Desce pro rodapé, mesmo padrão do forro, onde
  // sobra largura pra crescer para os dois lados.
  const rotulos: RotuloEsquema[] = [
    { texto: "PAREDE", xFrac: fr(paredeX - 4), yFrac: fr(16, ESQUEMA_H), cor: CINZA, tamanho: 6.5, ancora: "right" },
    { texto: d.distanciaTeto, xFrac: fr(equipX2 + 20), yFrac: fr((8 + equipY1) / 2 + 2, ESQUEMA_H), cor: CLARO, tamanho: 7, ancora: "left" },
    { texto: d.espacamentoLateral, xFrac: fr(ESQUEMA_W / 2), yFrac: fr(ESQUEMA_H - 1, ESQUEMA_H), cor: CLARO, tamanho: 6.5, ancora: "center" },
  ];
  return { svg, rotulos };
}

function esquemaMonobloco(d: DadosOverlay): { svg: string; rotulos: RotuloEsquema[] } {
  const vaoX1 = ESQUEMA_W / 2 - 34;
  const vaoX2 = ESQUEMA_W / 2 + 34;
  const vaoY1 = 26;
  const vaoY2 = 62;

  const svg =
    `<rect x="${vaoX1 - 4}" y="${vaoY1 - 4}" width="${vaoX2 - vaoX1 + 8}" height="${vaoY2 - vaoY1 + 8}" fill="none" stroke="${CINZA}" stroke-width="1.2" stroke-dasharray="3 3"/>` +
    `<rect x="${vaoX1}" y="${vaoY1}" width="${vaoX2 - vaoX1}" height="${vaoY2 - vaoY1}" rx="2" fill="#12203a" stroke="${AZUL}" stroke-width="1.4"/>` +
    (d.peDireito ? seta(vaoX2 + 14, vaoY1, vaoY2, AZUL) : "");

  const rotulos: RotuloEsquema[] = [{ texto: "vão da janela/parede", xFrac: fr(ESQUEMA_W / 2), yFrac: fr(vaoY2 + 16, ESQUEMA_H), cor: CINZA, tamanho: 6.5, ancora: "center" }];
  if (d.peDireito) rotulos.push({ texto: d.peDireito, xFrac: fr(vaoX2 + 20), yFrac: fr((vaoY1 + vaoY2) / 2 + 2, ESQUEMA_H), cor: CLARO, tamanho: 7, ancora: "left" });
  return { svg, rotulos };
}

export const ESQUEMA_COND_H = 70;

/**
 * Mini-esquema da unidade externa (condensadora), separado do aparelho
 * interno — pedido do Luke pra aparecer junto no card, não substituindo o
 * de dentro. `null` pra janela/monobloco: aquele tipo não tem condensadora
 * separada (peça única de fábrica).
 *
 * Não é o telhado/laje/sacada real do cliente (não temos foto disso) — é
 * esquemático, só a altura relativa (acima/abaixo/no nível do ambiente, a
 * única cota fixa que a pergunta de nível realmente dá) e o texto livre que
 * o vendedor respondeu pra "onde e a que distância".
 */
export function esquemaCondensadora(d: DadosOverlay): { svg: string; rotulos: RotuloEsquema[] } | null {
  if (familiaDe(d.tipoEquipamento) === "monobloco") return null;

  const nivel = (d.nivelCondensadora ?? "").toLowerCase();
  const refY = ESQUEMA_COND_H * 0.55;
  const boxW = 34;
  const boxH = 20;
  // "Acima"/"abaixo" só decidem de que lado da linha de referência a caixa
  // fica — a única cota real que a pergunta de nível dá é essa posição
  // relativa, nunca uma distância em metros (essa vem do texto livre).
  const boxY = nivel.includes("abaixo") ? refY + 6 : nivel.includes("acima") ? refY - boxH - 6 : refY - boxH / 2;
  const boxX = ESQUEMA_W / 2 - boxW / 2;

  const svg =
    `<line x1="8" y1="${refY}" x2="${ESQUEMA_W - 8}" y2="${refY}" stroke="${CINZA}" stroke-width="1" stroke-dasharray="2 3"/>` +
    `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="2" fill="#12203a" stroke="${AZUL}" stroke-width="1.4"/>` +
    `<line x1="${boxX + 5}" y1="${boxY + 5}" x2="${boxX + boxW - 5}" y2="${boxY + 5}" stroke="${AZUL}" stroke-width="0.8"/>` +
    `<line x1="${boxX + 5}" y1="${boxY + 10}" x2="${boxX + boxW - 5}" y2="${boxY + 10}" stroke="${AZUL}" stroke-width="0.8"/>` +
    `<line x1="${boxX + 5}" y1="${boxY + 15}" x2="${boxX + boxW - 5}" y2="${boxY + 15}" stroke="${AZUL}" stroke-width="0.8"/>` +
    feixe(boxX, boxY + boxH / 2, 12, refY + (nivel.includes("abaixo") ? 14 : -14));

  const rotulos: RotuloEsquema[] = [
    { texto: "CONDENSADORA", xFrac: fr(ESQUEMA_W / 2), yFrac: fr(8, ESQUEMA_COND_H), cor: CINZA, tamanho: 6.5, ancora: "center" },
    { texto: d.unidadeExterna ?? "local a definir", xFrac: fr(ESQUEMA_W / 2), yFrac: fr(ESQUEMA_COND_H - 3, ESQUEMA_COND_H), cor: CLARO, tamanho: 6.5, ancora: "center" },
  ];
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ESQUEMA_W} ${ESQUEMA_COND_H}" width="${ESQUEMA_W}" height="${ESQUEMA_COND_H}">${svg}</svg>`, rotulos };
}

/** Devolve o SVG cru (sem texto, sem data URI) e as etiquetas (posição em
 *  fração 0-1 do canvas ESQUEMA_W x ESQUEMA_H, pra quem chama escalar pro
 *  tamanho final que renderizar). Sempre desenha algo — mesmo sem cota
 *  confirmada, os textos já vêm como "conforme manual do fabricante" de quem
 *  monta `DadosOverlay`, nunca em branco. */
export function esquemaInstalacao(dados: DadosOverlay): { svg: string; rotulos: RotuloEsquema[] } {
  const familia = familiaDe(dados.tipoEquipamento);
  const { svg: corpo, rotulos } = familia === "forro" ? esquemaForro(dados) : familia === "monobloco" ? esquemaMonobloco(dados) : esquemaParede(dados);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ESQUEMA_W} ${ESQUEMA_H}" width="${ESQUEMA_W}" height="${ESQUEMA_H}">${corpo}</svg>`, rotulos };
}
