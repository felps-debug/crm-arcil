/* O único conversor de texto monetário do CRM.

   O mesmo valor chega em formatos diferentes conforme a origem: "823,11" (CSV
   pt-BR), "823.11" (.xlsx lido pelo SheetJS), "R$ 1.234,56" (cobranca_log). Cada
   rota tinha o seu parser, e um deles tirava todo ponto como se fosse milhar —
   "823.11" virou R$ 82.311,00 no cobranca_log. Converter valor: só por aqui. */

// Converte texto monetário ("530,00" pt-BR, "1.234,56" pt-BR ou "17.16" en-US) para número.
export function parseMoneyToNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
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
