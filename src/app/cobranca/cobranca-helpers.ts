/* ================================================================
   ARCIL CRM — Cobrança: helpers de parsing de planilha (ERP → leads)
   Portado da versão pré-regressão (commit 57d084e).
   ================================================================ */

import { formatCurrency } from "@/lib/utils";

export type SortKey = "nome" | "telefone" | "valor" | "vencimento" | "status_disparo" | "data_disparo";

export type DisparoLead = Record<string, string>;

export type BoletoItem = {
  doc: string;
  vencimento: string;
  valor: string; // "Receber" formatado — valor real com juros
  juros: string;
  multa: string;
  observacao: string;
};

export function normalizeKey(k: string) {
  return k.toLowerCase().replace(/[^a-z]/g, "");
}

// ERP exporta o cliente como "535 - 16.711.842 ADILSON ROBERTO SOARES" (código - doc nome)
// ou "1282 - CLEBER LEONARDO DOS SANTOS 05141624900" (doc colado no final do nome).
// Extrai só o nome, descartando código e CPF/CNPJ.
export function parseClienteField(raw: string): { codigo: string; nome: string } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d+)\s*-\s*(.+)$/);
  const codigo = m ? m[1] : "";
  let nome = (m ? m[2] : trimmed).trim();
  nome = nome.replace(/^[\d./-]+\s+/, ""); // remove CPF/CNPJ com pontos antes do nome
  nome = nome.replace(/\s+\d{6,}$/, ""); // remove CPF/CNPJ colado no final do nome
  return { codigo, nome: nome.trim() };
}

// Converte texto monetário ("530,00" pt-BR, "1.234,56" pt-BR ou "17.16" en-US) para número.
export function parseMoneyToNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : null;
}

/* ── Régua de follow-up ─────────────────────────────────────────────
   Horas desde `followups.created_at` até cada toque. Espelha o `case` de
   disparar_followup_cobranca() no Postgres — mudou lá, muda aqui, senão a
   tela promete um horário que o banco não cumpre. */
const REGUA_HORAS = [3, 24, 72, 120, 168];
const JANELA_INICIO = 8;
const JANELA_FIM = 18;

function horaEmSaoPaulo(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(d),
  );
}

/** A função do Postgres testa a janela na hora de disparar, não na hora alvo:
 *  um toque que vence às 22h só sai na manhã seguinte. */
function adiarParaJanela(alvo: Date): Date {
  const d = new Date(alvo);
  for (let i = 0; i < 24; i++) {
    const h = horaEmSaoPaulo(d);
    if (h >= JANELA_INICIO && h < JANELA_FIM) return d;
    d.setTime(d.getTime() + 3_600_000);
  }
  return d;
}

export type ProximoToque = { texto: string; tone: "blue" | "amber" | "slate" };

/**
 * Quando o próximo follow-up deste cliente deve sair.
 *
 * A aba mostrava só o número do step, que não diz nada sozinho. Com a régua
 * fixa dá para dizer quem recebe mensagem hoje — que é a pergunta de quem opera.
 */
export function proximoToque(
  followup: {
    created_at?: string | null;
    followup_step?: number | null;
    respondeu?: boolean | null;
    status?: string | null;
  },
  agora: Date = new Date(),
): ProximoToque {
  if (followup.respondeu) return { texto: "respondeu", tone: "slate" };
  if (followup.status && followup.status !== "PENDING") return { texto: "encerrado", tone: "slate" };
  if (!followup.created_at) return { texto: "—", tone: "slate" };

  const step = followup.followup_step ?? 0;
  const horas = REGUA_HORAS[step];
  if (horas == null) return { texto: "encerrado", tone: "slate" };

  const criado = new Date(followup.created_at);
  if (Number.isNaN(criado.getTime())) return { texto: "—", tone: "slate" };

  const quando = adiarParaJanela(new Date(criado.getTime() + horas * 3_600_000));
  const faltamMin = Math.round((quando.getTime() - agora.getTime()) / 60_000);

  // Vencido: o cron roda a cada minuto, então ou sai já ou está fora da janela.
  if (faltamMin <= 0) return { texto: "no próximo ciclo", tone: "amber" };
  if (faltamMin < 60) return { texto: `em ${faltamMin}min`, tone: "blue" };
  if (faltamMin < 48 * 60) return { texto: `em ${Math.round(faltamMin / 60)}h`, tone: "blue" };
  return { texto: `em ${Math.round(faltamMin / 1440)}d`, tone: "blue" };
}

// Colunas de data do relatório do ERP. normalizeKey já removeu o "ã" de "Emissão".
const CHAVES_DE_DATA = new Set(["prorrog", "emisso", "emissao", "vencimento", "datavcto", "vcto"]);

/**
 * Número de série do Excel → "dd/mm/aaaa".
 *
 * A época do Excel é 30/12/1899 e a contagem é em dias inteiros. Fazendo a conta
 * em UTC não há horário de verão para deslocar o dia.
 */
export function excelSerialToBR(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

/**
 * Troca o texto das colunas de data pelo valor derivado do número de série.
 *
 * O relatório do ERP grava as datas com o formato de célula `m/d/yy`. Lido como
 * texto — que é o que `raw: false` faz, e ele precisa continuar assim para não
 * corromper "530,00" em 53000 —, 10/06/2026 chega como a string "6/10/26", e daí
 * já não dá para saber se é 10 de junho ou 6 de outubro. Era assim que o agente
 * anunciava vencimento errado por meses.
 *
 * O número de série não tem essa ambiguidade: 46183 é 10/06/2026 e ponto. Por isso
 * a planilha é lida duas vezes — texto para o dinheiro, cru para as datas.
 *
 * CSV não tem número de série (tudo chega string), então nada é tocado.
 */
export function mergeDateSerials(
  formatadas: Record<string, unknown>[],
  cruas: Record<string, unknown>[],
): Record<string, unknown>[] {
  return formatadas.map((row, i) => {
    const crua = cruas[i];
    if (!crua) return row;
    const out = { ...row };
    for (const chave of Object.keys(row)) {
      if (!CHAVES_DE_DATA.has(normalizeKey(chave))) continue;
      const bruto = crua[chave];
      // Faixa de sanidade: 1955–2079. Fora dela não é data de boleto.
      if (typeof bruto === "number" && bruto > 20_000 && bruto < 66_000) {
        out[chave] = excelSerialToBR(bruto);
      }
    }
    return out;
  });
}

type RawBoleto = {
  numero: string;
  nome: string;
  codigoCliente: string;
  receberNum: number; // "Receber" = principal + juros + multa - já recebido
  valorDisplay: string;
  vencimento: string;
  documento: string;
  original: Record<string, string>;
  item: BoletoItem;
};

// Uma linha da planilha = um boleto. O agrupamento por cliente acontece depois,
// e só para a tela: quem dispara precisa dos boletos separados.
function parseRawBoletos(rows: Record<string, unknown>[]): RawBoleto[] {
  const rawBoletos: RawBoleto[] = [];

  for (const row of rows) {
    const original: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) original[k] = String(v ?? "").trim();

    const n: Record<string, string> = {};
    for (const [k, v] of Object.entries(original)) n[normalizeKey(k)] = v;

    // Telefone: prioriza celular (mais provável de ser WhatsApp)
    const rawPhone = n["celular"] || n["telefone"] || n["fone"] || n["whatsapp"] || n["numero"] || "";
    const digits = rawPhone.replace(/\D/g, "");
    const numero = digits ? `55${digits}` : "";
    if (!/^55\d{10,11}$/.test(numero)) continue;

    let nome = n["nome"] ?? "";
    let codigoCliente = "";
    if (!nome) {
      const clienteKey = Object.keys(n).find((k) => k.includes("cliente"));
      if (clienteKey) {
        const parsed = parseClienteField(n[clienteKey]);
        nome = parsed.nome;
        codigoCliente = parsed.codigo;
      }
    }

    // "Receber" = valor real a receber (principal + juros + multa - parcialmente pago)
    // É o campo que deve ser cobrado. "R$ Receb" é o que já foi pago — ignorar.
    const receberRaw = n["receber"] ?? "";
    const receberNum = parseMoneyToNumber(receberRaw) ?? 0;

    // Fallback: usar "R$ Princ" se Receber for zero
    let valorRaw = receberRaw;
    if (!valorRaw || receberNum === 0) {
      const princKey = Object.keys(n).find((k) => k.includes("princ"));
      if (princKey) valorRaw = n[princKey];
    }
    const valorNum = parseMoneyToNumber(valorRaw);
    const valorDisplay = valorNum !== null ? formatCurrency(valorNum) : valorRaw;

    const jurosNum = parseMoneyToNumber(n["rjuros"] ?? n["juros"] ?? "");
    const multaNum = parseMoneyToNumber(n["rmulta"] ?? n["multa"] ?? "");

    rawBoletos.push({
      numero,
      nome,
      codigoCliente,
      receberNum,
      valorDisplay,
      vencimento: n["vencimento"] ?? n["prorrog"] ?? n["datavcto"] ?? n["vcto"] ?? "",
      documento: n["serdocpar"] ?? n["documento"] ?? n["doc"] ?? n["cpf"] ?? n["cnpj"] ?? "",
      original,
      item: {
        doc: n["serdocpar"] ?? n["documento"] ?? "—",
        vencimento: n["vencimento"] ?? n["prorrog"] ?? "—",
        valor: receberNum > 0 ? formatCurrency(receberNum) : valorDisplay,
        juros: jurosNum != null ? formatCurrency(jurosNum) : "—",
        multa: multaNum != null ? formatCurrency(multaNum) : "—",
        observacao: original["Observação"] ?? original["observacao"] ?? "",
      },
    });
  }

  return rawBoletos;
}

function agruparPorTelefone(rawBoletos: RawBoleto[]): RawBoleto[][] {
  const byPhone: Record<string, RawBoleto[]> = {};
  for (const b of rawBoletos) {
    if (!byPhone[b.numero]) byPhone[b.numero] = [];
    byPhone[b.numero].push(b);
  }
  return Object.values(byPhone);
}

/**
 * Uma linha por boleto, que é o formato que o serviço de cobrança espera.
 *
 * Antes o CRM mandava uma linha por CLIENTE, com os vencimentos concatenados por
 * " | " e as colunas do ERP do primeiro boleto. O serviço lê `Receber`,
 * `Ser/Doc/Par` e `Prorrog` da linha que chega, então um cliente com três boletos
 * virava um boleto só: o valor do primeiro, com as três datas empilhadas num campo.
 * Foi assim que uma dívida de R$ 932,00 foi cobrada como R$ 298,55.
 *
 * O agrupamento por telefone continua existindo — só que do lado do serviço, que
 * já faz isso em agrupar_leads() e monta o array de boletos corretamente.
 */
export function parseSheetRows(rows: Record<string, unknown>[]): DisparoLead[] {
  const grupos = agruparPorTelefone(parseRawBoletos(rows));

  return grupos.flatMap((group) => {
    const totalReceber = group.reduce((s, b) => s + b.receberNum, 0);
    // Vai repetido em cada linha do mesmo cliente; a API usa o primeiro que achar.
    const boletosJson = JSON.stringify(group.map((b) => b.item));

    return group.map((b) => ({
      ...b.original,
      numero: b.numero,
      nome: b.nome,
      codigo_cliente: b.codigoCliente,
      // Deste boleto, não do cliente. Mesmo formato do preview agrupado: número
      // em pt-BR, sem "R$" — é o que o serviço de cobrança sabe ler.
      valor:
        b.receberNum > 0
          ? b.receberNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : b.valorDisplay,
      vencimento: b.vencimento,
      documento: b.documento,
      // Do cliente inteiro — a API soma para corrigir o valor gravado no log
      valor_numerico: totalReceber > 0 ? totalReceber.toFixed(2) : "",
      boleto_count: String(group.length),
      boletos_json: boletosJson,
      tag: "COBRANCA",
    }));
  });
}

/** Um lead por cliente, com total e boletos agrupados. Só para o preview da tela. */
export function parseSheetLeads(rows: Record<string, unknown>[]): DisparoLead[] {
  return agruparPorTelefone(parseRawBoletos(rows)).map((group) => {
    const first = group[0];
    const totalReceber = group.reduce((s, b) => s + b.receberNum, 0);
    const boletoCount = group.length;
    const vencimentos = [...new Set(group.map((b) => b.vencimento).filter(Boolean))].join(" | ");

    return {
      ...first.original,
      numero: first.numero,
      nome: first.nome,
      valor:
        totalReceber > 0
          ? totalReceber.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : first.valorDisplay,
      // `valor` vai formatado em pt-BR ("471,50") e quem consome do outro lado
      // precisa adivinhar o locale — foi assim que R$ 471,50 virou R$ 4.715,00
      // no cobranca_log. Este campo vai sem formatação nenhuma, ponto decimal,
      // para não sobrar interpretação.
      valor_numerico: totalReceber > 0 ? totalReceber.toFixed(2) : "",
      codigo_cliente: first.codigoCliente,
      vencimento: boletoCount === 1 ? first.vencimento : vencimentos,
      documento: first.documento,
      boleto_count: String(boletoCount),
      tag: "COBRANCA",
      boletos_json: JSON.stringify(group.map((b) => b.item)),
    };
  });
}
