import { read, utils } from "xlsx";

export type CobrancaLead = Record<string, string>;

function normalizeKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function parseCobrancaFile(file: File): Promise<CobrancaLead[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não contém nenhuma aba válida.");

  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const leads: CobrancaLead[] = [];
  for (const row of rows) {
    const values: CobrancaLead = {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const text = String(value ?? "").trim();
      values[key] = text;
      normalized[normalizeKey(key)] = text;
    }

    const rawPhone = ["telefone", "celular", "fone", "whatsapp", "numero"]
      .map((key) => normalized[key])
      .find(Boolean);
    const telefone = normalizePhone(rawPhone);
    if (!telefone || !/^55\d{10,11}$/.test(telefone)) continue;

    const nome = normalized.nome || normalized.cliente || "";
    leads.push({
      ...values,
      telefone,
      numero: telefone,
      nome,
      valor: normalized.valor || normalized.receber || normalized.princ || "",
      vencimento: normalized.vencimento || normalized.datavcto || normalized.vcto || "",
      documento: normalized.documento || normalized.doc || normalized.cpf || normalized.cnpj || "",
      tag: "COBRANCA",
    });
  }

  if (!leads.length) {
    throw new Error("Nenhum telefone válido foi encontrado. Use uma coluna telefone, celular ou WhatsApp com DDD.");
  }
  return leads;
}
