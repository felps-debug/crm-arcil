import { describe, expect, it } from "vitest";
import {
  parseClienteField,
  parseMoneyToNumber,
  parseSheetLeads,
  parseSheetRows,
} from "./cobranca-helpers";

describe("parseClienteField", () => {
  it("splits the ERP 'codigo - nome' format and strips CPF/CNPJ, whether leading or trailing", () => {
    // Examples taken verbatim from the comment above the implementation.
    expect(parseClienteField("535 - 16.711.842 ADILSON ROBERTO SOARES")).toEqual({
      codigo: "535",
      nome: "ADILSON ROBERTO SOARES",
    });

    expect(parseClienteField("1282 - CLEBER LEONARDO DOS SANTOS 05141624900")).toEqual({
      codigo: "1282",
      nome: "CLEBER LEONARDO DOS SANTOS",
    });
  });
});

describe("parseMoneyToNumber", () => {
  it("parses pt-BR, comma-only and en-US monetary strings, and returns null for empty/invalid input", () => {
    expect(parseMoneyToNumber("1.234,56")).toBe(1234.56); // pt-BR thousands + decimal
    expect(parseMoneyToNumber("530,00")).toBe(530); // comma-only decimal
    expect(parseMoneyToNumber("17.16")).toBe(17.16); // en-US decimal
    expect(parseMoneyToNumber("")).toBeNull();
    expect(parseMoneyToNumber("abc")).toBeNull();
  });
});

describe("parseSheetLeads", () => {
  it("normalizes phones to 55DDD########, drops rows with too few digits, and groups boletos of the same phone into one lead", () => {
    const rows = [
      {
        Celular: "(11) 91234-5678",
        Cliente: "535 - 16.711.842 ADILSON ROBERTO SOARES",
        Receber: "530,00",
        Vencimento: "10/01/2024",
      },
      {
        Celular: "(11) 91234-5678",
        Cliente: "535 - 16.711.842 ADILSON ROBERTO SOARES",
        Receber: "120,50",
        Vencimento: "15/02/2024",
      },
      {
        // Telefone fixo sem DDD — poucos dígitos, deve ser descartado.
        Celular: "1234-5678",
        Nome: "LEAD IGNORADO",
        Receber: "50,00",
        Vencimento: "01/01/2024",
      },
    ];

    const leads = parseSheetLeads(rows);

    // A terceira linha (telefone curto demais) é descartada.
    expect(leads).toHaveLength(1);

    const [lead] = leads;
    expect(lead.numero).toBe("5511912345678"); // "55" + DDD (11) + 9 dígitos do celular
    expect(lead.nome).toBe("ADILSON ROBERTO SOARES");
    expect(lead.codigo_cliente).toBe("535");
    expect(lead.boleto_count).toBe("2");
    expect(lead.valor).toBe("650,50"); // 530,00 + 120,50 somados
    expect(lead.vencimento).toBe("10/01/2024 | 15/02/2024");
    expect(lead.tag).toBe("COBRANCA");
  });
});

describe("parseSheetRows", () => {
  it("keeps one row per boleto so the dispatch service can rebuild the client's position", () => {
    // A mesma planilha do teste acima: dois boletos do mesmo telefone.
    // O preview agrupa em um cliente; o disparo NÃO pode agrupar, senão o
    // serviço lê as colunas do ERP do primeiro boleto e cobra só ele.
    const rows = [
      {
        Celular: "(11) 91234-5678",
        Cliente: "535 - ADILSON ROBERTO SOARES",
        "Ser/Doc/Par": "B1 001",
        Receber: "530,00",
        Vencimento: "10/01/2024",
      },
      {
        Celular: "(11) 91234-5678",
        Cliente: "535 - ADILSON ROBERTO SOARES",
        "Ser/Doc/Par": "B1 002",
        Receber: "120,50",
        Vencimento: "15/02/2024",
      },
    ];

    const linhas = parseSheetRows(rows);

    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.documento)).toEqual(["B1 001", "B1 002"]);
    // Cada linha carrega o valor e o vencimento DO SEU boleto, nunca concatenados.
    expect(linhas.map((l) => l.valor)).toEqual(["530,00", "120,50"]);
    expect(linhas.map((l) => l.vencimento)).toEqual(["10/01/2024", "15/02/2024"]);
    linhas.forEach((l) => expect(l.vencimento).not.toContain("|"));

    // O total do cliente viaja repetido, para a API corrigir o valor do log.
    expect(linhas.map((l) => l.valor_numerico)).toEqual(["650.50", "650.50"]);
    expect(linhas.map((l) => l.numero)).toEqual(["5511912345678", "5511912345678"]);
    expect(linhas.map((l) => l.boleto_count)).toEqual(["2", "2"]);
  });
});
