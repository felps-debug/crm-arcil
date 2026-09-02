/**
 * Regras e padrões técnicos de instalação de ar-condicionado, baseados na
 * ABNT NBR 16655 / NBR 5410 e manuais dos principais fabricantes no Brasil.
 *
 * Serve de fallback e padrão de garantia de fábrica enquanto não temos os
 * PDFs dos manuais cadastrados: alimenta o payload enviado ao n8n e a
 * composição da Prancha Técnica de Instalação.
 */

export interface HvacDimensions {
  largura_cm: number;
  altura_cm: number;
  profundidade_cm: number;
}

export interface HvacStandardRule {
  cota_teto: string;
  cota_lateral: string;
  cota_piso: string;
  plenum_minimo?: string;
  alcapao?: string;
  tubulacao_minima: string;
  vacuo_obrigatorio: string;
  eletrica_norma: string;
  dreno_norma: string;
  passo_a_passo: string[];
  recomendacoes_garantia: string[];
}

export const HVAC_STANDARDS: Record<string, HvacStandardRule> = {
  "Hi-Wall": {
    cota_teto: "mín. 15 cm",
    cota_lateral: "mín. 15 cm a 30 cm",
    cota_piso: "mín. 2,00 m a 2,30 m",
    tubulacao_minima: "2 a 3 metros (cobre isolado)",
    vacuo_obrigatorio: "< 500 micra (com vacuômetro digital)",
    eletrica_norma: "Disjuntor dedicado + Aterramento (NBR 5410)",
    dreno_norma: "Caimento contínuo mínimo 1% a 2%",
    passo_a_passo: [
      "1. Marcar e fixar placa de montagem nivelada",
      "2. Fazer furo de 65mm com caimento externo",
      "3. Passar tubulação de cobre isolada e cabo PP",
      "4. Conectar flanges com torquímetro e pressurizar N2",
      "5. Realizar vácuo < 500µm e liberar fluido refrigerante",
    ],
    recomendacoes_garantia: [
      "Tubulação frigorígena de cobre 100% isolada individualmente",
      "Teste de vácuo abaixo de 500 microns obrigatório",
      "Proibido expurgo de gás — causa perda imediata de garantia",
      "Disjuntor exclusivo e aterramento elétrico obrigatório",
    ],
  },
  Cassete: {
    cota_teto: "Embutido flush no forro",
    cota_lateral: "mín. 1,0 m de paredes e lustres",
    cota_piso: "2,50 m a 3,50 m",
    plenum_minimo: "26 cm a 35 cm",
    alcapao: "Obrigatório 60x60 cm junto às conexões",
    tubulacao_minima: "2 a 3 metros (cobre isolado)",
    vacuo_obrigatorio: "< 500 micra (com vacuômetro digital)",
    eletrica_norma: "220V exclusivo com aterramento",
    dreno_norma: "Bomba interna + linha rígida com caimento mín. 1%",
    passo_a_passo: [
      "1. Marcar e abrir vão no forro",
      "2. Fixar 4 tirantes roscados na laje com amortecedores",
      "3. Passar tubulações, dreno rígido isolado e cabos",
      "4. Encaixar gabinete, nivelar e instalar painel 4 vias",
      "5. Testar bomba de dreno, estanqueidade com N2 e vácuo",
    ],
    recomendacoes_garantia: [
      "Alçapão de inspeção 60x60 cm obrigatório para manutenção",
      "Tubulação de cobre com isolamento térmico individual",
      "Teste de drenagem antes do fechamento do forro",
      "Vácuo inferior a 500 micra estabilizado",
    ],
  },
  "Piso-Teto": {
    cota_teto: "mín. 20 cm da parede traseira (se no teto)",
    cota_lateral: "mín. 20 cm",
    cota_piso: "mín. 10 cm a 15 cm do piso (se no chão)",
    tubulacao_minima: "mínimo 3 metros",
    vacuo_obrigatorio: "< 500 micra (com vacuômetro digital)",
    eletrica_norma: "Circuito dedicado dimensionado para alta corrente",
    dreno_norma: "Caimento contínuo em PVC rígido isolado",
    passo_a_passo: [
      "1. Definir fixação estrutural (Teto suspenso ou Piso vertical)",
      "2. Fixar tirantes reforçados na laje/chumbadores na parede",
      "3. Passar infraestrutura frigorígena reforçada",
      "4. Acoplar unidade, conectar linhas e criar sifão se necessário",
      "5. Teste de estanqueidade a 450 PSI, vácuo < 500µm e carga de gás",
    ],
    recomendacoes_garantia: [
      "Fixação estrutural em laje obrigatória devido ao peso",
      "Sifão na sucção a cada 3-5m se condensadora estiver acima",
      "Isolamento térmico elastomérico de alta densidade",
      "Vácuo digital rigoroso abaixo de 500 micra",
    ],
  },
  Dutado: {
    cota_teto: "Embutido no entreforro técnico",
    cota_lateral: "Distância calculada conforme rede de dutos",
    cota_piso: "Conforme projeto de climatização",
    plenum_minimo: "35 cm a 50 cm",
    alcapao: "Alçapão amplo para acesso ao motor e filtros",
    tubulacao_minima: "mínimo 3 metros",
    vacuo_obrigatorio: "< 500 micra",
    eletrica_norma: "Alimentação dedicada com aterramento",
    dreno_norma: "Bandeja com caimento e dreno isolado",
    passo_a_passo: [
      "1. Suspender evaporadora na laje com tirantes antivibração",
      "2. Conectar rede de dutos com isolamento térmico MPU/Lã",
      "3. Instalar caixas de plenum, difusores e grelhas de retorno",
      "4. Passar linha de cobre, dreno e fiação de comando",
      "5. Teste de estanqueidade dos dutos, vácuo e balanceamento de ar",
    ],
    recomendacoes_garantia: [
      "Isolamento térmico contínuo na rede de dutos",
      "Acesso desimpedido para troca e limpeza periódica de filtros",
      "Teste de vácuo < 500 micra e teste de estanqueidade N2",
    ],
  },
  Janela: {
    cota_teto: "Centralizado no vão",
    cota_lateral: "mín. 10 cm das laterais do caixilho",
    cota_piso: "1,50 m a 1,80 m",
    tubulacao_minima: "N/A (Monobloco)",
    vacuo_obrigatorio: "N/A (Carga selada de fábrica)",
    eletrica_norma: "Tomada exclusiva e aterrada 20A",
    dreno_norma: "Inclinação de 5mm a 10mm para a área externa",
    passo_a_passo: [
      "1. Preparar o vão na alvenaria ou madeira",
      "2. Instalar caixilho com inclinação para o exterior",
      "3. Encaixar o aparelho garantindo aletas externas livres",
      "4. Vedar frestas com espuma/perfil de vedação",
      "5. Conectar na tomada exclusiva aterrada e testar",
    ],
    recomendacoes_garantia: [
      "Aletas laterais e traseiras 100% desobstruídas para ventilação",
      "Leve inclinação traseira para escoamento natural da água",
      "Circuito elétrico exclusivo com aterramento obrigatório",
    ],
  },
};

/** Chave canônica de cada tipo aceito pelo mapa acima, indexada por variação
 *  normalizada (minúsculo, sem acento) — o valor real de `tipo_equipamento`
 *  varia por origem: o seletor do chatbot manda "Split Hi-Wall"/"Piso-teto",
 *  o texto livre reextraído por IA pode mandar "hi-wall" ou "piso teto". */
const ALIASES: Record<string, keyof typeof HVAC_STANDARDS> = {
  "hi-wall": "Hi-Wall",
  "hiwall": "Hi-Wall",
  "split hi-wall": "Hi-Wall",
  "split hiwall": "Hi-Wall",
  "cassete": "Cassete",
  "cassette": "Cassete",
  "piso-teto": "Piso-Teto",
  "piso teto": "Piso-Teto",
  "pisoteto": "Piso-Teto",
  "dutado": "Dutado",
  "janela": "Janela",
};

function normalizar(tipo: string): string {
  return tipo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Devolve a regra técnica do tipo informado, com fallback seguro para
 *  "Hi-Wall" quando o tipo não é reconhecido — nunca devolve `undefined`. */
export function getHvacStandard(tipoEquipamento: string): HvacStandardRule {
  const chave = ALIASES[normalizar(tipoEquipamento ?? "")];
  return HVAC_STANDARDS[chave ?? "Hi-Wall"];
}

// ---------------------------------------------------------------------------
// Medidas físicas — fallback por tipo + faixa de BTUs, pra quando o ERP não
// trouxer dimensão nenhuma (checado em 2026-08-26: nenhuma das 4 tabelas de
// produto tem coluna de largura/altura/profundidade, e a coluna `btu` que
// existe está null em toda linha — a única capacidade que aparece de verdade
// é o número embutido no NOME do produto, ex: "...24000 FRIO...").
// ---------------------------------------------------------------------------

type FaixaDimensao = { btuMin: number; btuMax: number; dims: HvacDimensions };

export const HVAC_DEFAULT_DIMENSIONS: Record<string, FaixaDimensao[]> = {
  "Hi-Wall": [
    { btuMin: 9000, btuMax: 12000, dims: { largura_cm: 80, altura_cm: 28, profundidade_cm: 20 } },
    { btuMin: 18000, btuMax: 24000, dims: { largura_cm: 100, altura_cm: 32, profundidade_cm: 23 } },
    { btuMin: 30000, btuMax: Infinity, dims: { largura_cm: 115, altura_cm: 34, profundidade_cm: 25 } },
  ],
  // Painel visível é maior que o gabinete embutido (compacto: painel 70x70;
  // standard: painel 95x95) — não cabe no tipo `HvacDimensions` (só L/A/P do
  // gabinete), por isso fica só documentado aqui, não no valor retornado.
  Cassete: [
    { btuMin: 0, btuMax: 24000, dims: { largura_cm: 65, altura_cm: 65, profundidade_cm: 26 } },
    { btuMin: 24001, btuMax: 60000, dims: { largura_cm: 84, altura_cm: 84, profundidade_cm: 29 } },
  ],
  "Piso-Teto": [
    { btuMin: 24000, btuMax: 36000, dims: { largura_cm: 100, altura_cm: 65, profundidade_cm: 24 } },
    { btuMin: 48000, btuMax: 60000, dims: { largura_cm: 165, altura_cm: 68, profundidade_cm: 24 } },
  ],
  // Largura real varia com o comprimento da rede de dutos, não só a
  // capacidade — 120 é o meio da faixa 100-140cm que o fabricante documenta.
  Dutado: [{ btuMin: 24000, btuMax: 60000, dims: { largura_cm: 120, altura_cm: 30, profundidade_cm: 70 } }],
  Janela: [
    { btuMin: 7000, btuMax: 10000, dims: { largura_cm: 45, altura_cm: 32, profundidade_cm: 50 } },
    { btuMin: 12000, btuMax: 18000, dims: { largura_cm: 60, altura_cm: 38, profundidade_cm: 55 } },
  ],
};

/** Acha o BTU num texto livre: "12.000 BTU/h", "24000", "Split ... 24000 Frio
 *  Inverter ...". Prioriza o número junto da palavra BTU; sem isso, cai pro
 *  primeiro número de 4-5 dígitos que bate uma capacidade real de mercado —
 *  evita casar com o código do produto ou o ano de um texto qualquer. */
function extrairBtu(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const comPalavra = texto.match(/(\d{1,3}(?:[.,]\d{3})?)\s*btu/i);
  if (comPalavra) {
    const n = Number(comPalavra[1].replace(/[.,]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const CAPACIDADES_CONHECIDAS = [7000, 9000, 10000, 12000, 18000, 22000, 24000, 30000, 36000, 48000, 60000];
  const numeros = texto.match(/\d{4,6}/g) ?? [];
  for (const bruto of numeros) {
    const n = Number(bruto);
    if (CAPACIDADES_CONHECIDAS.includes(n)) return n;
  }
  return null;
}

/** Dado o tipo e o BTU (quando encontrado), escolhe a faixa de dimensão mais
 *  próxima. Sem BTU reconhecido, usa a primeira faixa cadastrada daquele tipo
 *  como chute — melhor uma estimativa do meio da linha do que nenhum número. */
function dimensaoPadraoPara(tipo: keyof typeof HVAC_STANDARDS, btu: number | null): HvacDimensions {
  const faixas = HVAC_DEFAULT_DIMENSIONS[tipo] ?? HVAC_DEFAULT_DIMENSIONS["Hi-Wall"];
  if (btu != null) {
    const faixa = faixas.find((f) => btu >= f.btuMin && btu <= f.btuMax);
    if (faixa) return faixa.dims;
  }
  return faixas[0].dims;
}

/**
 * Extrai dimensões físicas de um produto vindo do ERP, se por acaso vierem —
 * hoje (2026-08-26) nenhuma tabela de produto traz isso, então esta função
 * serve de porta pronta pro dia em que o ERP passar a trazer, sem precisar
 * mexer em quem chama. Aceita tanto campos numéricos separados quanto uma
 * string única "800x280x200mm" / "80x28x20".
 */
export function extractErpDimensions(product: unknown): Partial<HvacDimensions> | null {
  if (!product || typeof product !== "object") return null;
  const p = product as Record<string, unknown>;

  const numerico = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  // Em mm o valor típico de um split passa de 200 (ex: profundidade 200mm) —
  // heurística grosseira, mas os dois mundos (cm de móvel, mm de gabinete)
  // não se confundem na prática: nada de ar-condicionado mede >999cm.
  const paraCm = (n: number): number => (n > 999 ? n / 10 : n);

  const largura = numerico(p.largura ?? p.largura_cm ?? p.width);
  const altura = numerico(p.altura ?? p.altura_cm ?? p.height);
  const profundidade = numerico(p.profundidade ?? p.profundidade_cm ?? p.depth);
  if (largura && altura && profundidade) {
    return { largura_cm: paraCm(largura), altura_cm: paraCm(altura), profundidade_cm: paraCm(profundidade) };
  }

  const textoComposto = [p.dimensoes, p.medidas, p.especificacoes, p.technical_specs]
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (textoComposto) {
    const m = textoComposto.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
    if (m) {
      const [l, a, p2] = m.slice(1, 4).map((v) => paraCm(Number(v.replace(",", "."))));
      if (l && a && p2) return { largura_cm: l, altura_cm: a, profundidade_cm: p2 };
    }
  }

  return null;
}

export type OrigemDimensoes = "erp" | "padrao_estimado";

export type EquipmentSpecs = {
  dimensoes: HvacDimensions;
  dimensoesFormatadas: string;
  origemDimensoes: OrigemDimensoes;
  btu: number | null;
  regra: HvacStandardRule;
};

function formatarDimensoes(d: HvacDimensions): string {
  return `${d.largura_cm}cm (L) x ${d.altura_cm}cm (A) x ${d.profundidade_cm}cm (P)`;
}

/**
 * Resolve as especificações finais do equipamento: tenta o ERP primeiro
 * (`extractErpDimensions`), cai pro padrão por tipo+BTU quando faltar algo —
 * nunca devolve dimensão parcial pro chamador, ou vem completa do ERP ou vem
 * inteira do fallback.
 */
export function resolveEquipmentSpecs(tipo: string, btuString?: string | null, erpProduct?: unknown): EquipmentSpecs {
  const regra = getHvacStandard(tipo);
  const chave = ALIASES[normalizar(tipo ?? "")] ?? "Hi-Wall";

  const btu =
    extrairBtu(btuString) ??
    extrairBtu(typeof (erpProduct as Record<string, unknown> | undefined)?.nome === "string" ? ((erpProduct as Record<string, unknown>).nome as string) : null) ??
    extrairBtu(typeof (erpProduct as Record<string, unknown> | undefined)?.name === "string" ? ((erpProduct as Record<string, unknown>).name as string) : null);

  const doErp = extractErpDimensions(erpProduct);
  const completoDoErp = doErp && doErp.largura_cm && doErp.altura_cm && doErp.profundidade_cm ? (doErp as HvacDimensions) : null;

  const dimensoes = completoDoErp ?? dimensaoPadraoPara(chave, btu);
  const origemDimensoes: OrigemDimensoes = completoDoErp ? "erp" : "padrao_estimado";

  return { dimensoes, dimensoesFormatadas: formatarDimensoes(dimensoes), origemDimensoes, btu, regra };
}

/**
 * Afastamentos mínimos da unidade condensadora.
 *
 * Não estão em `HVAC_STANDARDS` porque aquele mapa é indexado pelo tipo da
 * unidade INTERNA (hi-wall, cassete, dutado…) e a condensadora é a mesma peça
 * em todos eles: quem muda é o local de instalação, não o tipo do evaporador.
 *
 * São os mínimos que a maioria dos fabricantes exige em manual para não perder
 * garantia; a NBR 16655 trata do procedimento de instalação, não de cota. Por
 * isso o texto fala em "manual do fabricante" e não cita norma.
 */
export const CONDENSADORA_AFASTAMENTOS = {
  frente: "mín. 1,50 m livres na saída de ar",
  traseira: "mín. 10 cm da parede",
  laterais: "mín. 30 cm de cada lado",
  superior: "mín. 50 cm livres acima",
  base: "base nivelada, com coxins antivibração",
} as const;

/** Os mesmos afastamentos como bullets, na ordem em que fazem sentido ler. */
export const CONDENSADORA_BULLETS: string[] = [
  CONDENSADORA_AFASTAMENTOS.frente,
  CONDENSADORA_AFASTAMENTOS.traseira,
  CONDENSADORA_AFASTAMENTOS.laterais,
  CONDENSADORA_AFASTAMENTOS.superior,
  CONDENSADORA_AFASTAMENTOS.base,
];
