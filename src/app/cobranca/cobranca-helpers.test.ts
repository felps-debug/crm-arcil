import { describe, expect, it } from "vitest";
import {
  excelSerialToBR,
  mergeDateSerials,
  parseClienteField,
  parseMoneyToNumber,
  parseSheetLeads,
  parseSheetRows,
  proximoToque,
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

describe("proximoToque", () => {
  // 10/08/2026 é uma segunda. Horários em -03:00, que é America/Sao_Paulo.
  const criado = "2026-08-10T09:00:00-03:00"; // segunda, 9h

  it("uses the ladder the Postgres function uses: 3h, 24h, 72h, 120h, 168h", () => {
    // Step 0 → primeiro toque 3h depois do insert, às 12h.
    expect(proximoToque({ created_at: criado, followup_step: 0, status: "PENDING" }, new Date("2026-08-10T10:00:00-03:00")))
      .toEqual({ texto: "em 2h", tone: "blue" });

    // Step 1 → 24h depois do insert, não 24h depois do toque anterior.
    expect(proximoToque({ created_at: criado, followup_step: 1, status: "PENDING" }, new Date("2026-08-10T13:00:00-03:00")))
      .toEqual({ texto: "em 20h", tone: "blue" });

    // Step 3 → 120h = 5 dias.
    expect(proximoToque({ created_at: criado, followup_step: 3, status: "PENDING" }, new Date("2026-08-10T09:00:00-03:00")))
      .toEqual({ texto: "em 5d", tone: "blue" });
  });

  it("pushes a touch that falls outside 8h-18h to the next window", () => {
    // Insert às 23h de segunda + 3h = 2h de terça, fora da janela. O Postgres
    // testa a janela na hora de disparar, então isso só sai às 8h.
    const madrugada = proximoToque(
      { created_at: "2026-08-10T23:00:00-03:00", followup_step: 0, status: "PENDING" },
      new Date("2026-08-11T02:00:00-03:00"),
    );
    expect(madrugada).toEqual({ texto: "em 6h", tone: "blue" });
  });

  it("stops the ladder when the customer replied, when it ended, and after the fifth touch", () => {
    expect(proximoToque({ created_at: criado, followup_step: 1, respondeu: true, status: "PENDING" }).texto).toBe("respondeu");
    expect(proximoToque({ created_at: criado, followup_step: 5, status: "LOST" }).texto).toBe("encerrado");
    // Quinto toque dado: não há sexto.
    expect(proximoToque({ created_at: criado, followup_step: 5, status: "PENDING" }).texto).toBe("encerrado");
  });

  it("flags an overdue touch instead of showing a negative countdown", () => {
    expect(proximoToque({ created_at: criado, followup_step: 0, status: "PENDING" }, new Date("2026-08-10T15:00:00-03:00")))
      .toEqual({ texto: "no próximo ciclo", tone: "amber" });
  });
});

describe("excelSerialToBR", () => {
  it("converts Excel serials to dd/mm/aaaa", () => {
    // Valores lidos do relatório real do ERP (cobrancas phb mga 22.06.xlsx).
    expect(excelSerialToBR(46183)).toBe("10/06/2026");
    expect(excelSerialToBR(46153)).toBe("11/05/2026");
    expect(excelSerialToBR(45658)).toBe("01/01/2025");
  });
});

describe("mergeDateSerials", () => {
  it("rebuilds the date from the serial, because the ERP formats its cells as m/d/yy", () => {
    // O que sai de sheet_to_json com raw:false na planilha real: a célula tem
    // formato m/d/yy, então 10/06/2026 vira a string "6/10/26" e não há como
    // saber se é 10 de junho ou 6 de outubro.
    const formatadas = [{ "Ser/Doc/Par": "CxPhM 921 3/3", Prorrog: "6/10/26", Receber: "313.73" }];
    const cruas = [{ "Ser/Doc/Par": "CxPhM 921 3/3", Prorrog: 46183, Receber: 313.73 }];

    const [row] = mergeDateSerials(formatadas, cruas);

    expect(row.Prorrog).toBe("10/06/2026");
    // Só as colunas de data mudam — o dinheiro continua vindo do texto formatado.
    expect(row.Receber).toBe("313.73");
    expect(row["Ser/Doc/Par"]).toBe("CxPhM 921 3/3");
  });

  it("leaves CSV rows alone, where every cell is already text", () => {
    const rows = [{ Prorrog: "10/06/2026", Receber: "530,00" }];
    expect(mergeDateSerials(rows, rows)).toEqual(rows);
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
