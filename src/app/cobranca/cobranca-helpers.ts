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

export function parseSheetLeads(rows: Record<string, unknown>[]): DisparoLead[] {
  // 1. Processar cada linha em um boleto normalizado
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
    if (numero.length < 12) continue;

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

  // 2. Agrupar por número de telefone
  const byPhone: Record<string, RawBoleto[]> = {};
  for (const b of rawBoletos) {
    if (!byPhone[b.numero]) byPhone[b.numero] = [];
    byPhone[b.numero].push(b);
  }

  // 3. Um DisparoLead por cliente com valor total e detalhes dos boletos
  return Object.values(byPhone).map((group) => {
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
      codigo_cliente: first.codigoCliente,
      vencimento: boletoCount === 1 ? first.vencimento : vencimentos,
      documento: first.documento,
      boleto_count: String(boletoCount),
      tag: "COBRANCA",
      boletos_json: JSON.stringify(group.map((b) => b.item)),
    };
  });
}
