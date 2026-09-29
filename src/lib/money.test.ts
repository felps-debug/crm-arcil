import { describe, expect, it } from "vitest";
import { parseMoneyToNumber } from "./money";

describe("parseMoneyToNumber", () => {
  it("reads every format a value reaches the CRM in", () => {
    expect(parseMoneyToNumber("823.11")).toBe(823.11); // .xlsx via SheetJS — virou 82.311,00
    expect(parseMoneyToNumber("743,47")).toBe(743.47); // CSV pt-BR
    expect(parseMoneyToNumber("R$ 1.234,56")).toBe(1234.56); // cobranca_log
    expect(parseMoneyToNumber("R$ 82.311,00")).toBe(82311); // NBSP do toLocaleString
    expect(parseMoneyToNumber("1,234.56")).toBe(1234.56); // en-US com milhar
    expect(parseMoneyToNumber(823.11)).toBe(823.11);
  });

  it("returns null when there is no value", () => {
    expect(parseMoneyToNumber("")).toBeNull();
    expect(parseMoneyToNumber(null)).toBeNull();
    expect(parseMoneyToNumber("abc")).toBeNull();
  });
});
