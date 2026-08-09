import { describe, expect, it } from "vitest";
import {
  excelSerialToBR,
  mergeDateSerials,
  normalizarDataBR,
  normalizarDatasTexto,
  normalizarTelefone,
  parseSheetRecusados,
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

describe("normalizarTelefone", () => {
  it("keeps a phone that is already in the current format", () => {
    expect(normalizarTelefone("(44) 99171-8337")).toBe("5544991718337");
    expect(normalizarTelefone("(11) 95208-3574")).toBe("5511952083574");
  });

  it("restores the ninth digit on the ERP's old 8-digit mobiles", () => {
    // Casos reais do relatorio-conta-receber-cobranca. O ERP traz a mesma linha
    // nas duas formas — Telefone (44) 9171-8337 e Celular (44) 99171-8337 —,
    // então a correção é acrescentar o 9.
    expect(normalizarTelefone("(44) 9171-8337")).toBe("5544991718337");
    expect(normalizarTelefone("(43) 9604-8570")).toBe("5543996048570");
    expect(normalizarTelefone("(44) 9925-7839")).toBe("5544999257839");
    expect(normalizarTelefone("(44) 9840-7636")).toBe("5544998407636");
  });

  it("refuses a landline instead of guessing, because it will never be on WhatsApp", () => {
    // BANDELAJES e GUILHERME SCUIRA, do relatório real.
    expect(normalizarTelefone("(43) 3253-1641")).toEqual({ motivo: "fixo", original: "(43) 3253-1641" });
    expect(normalizarTelefone("(42) 3646-4042")).toEqual({ motivo: "fixo", original: "(42) 3646-4042" });
  });

  it("refuses empty and malformed input", () => {
    expect(normalizarTelefone("")).toEqual({ motivo: "vazio", original: "" });
    expect(normalizarTelefone("1234-5678")).toEqual({ motivo: "invalido", original: "1234-5678" });
  });

  it("does not double the country code when the export already carries it", () => {
    expect(normalizarTelefone("5544991718337")).toBe("5544991718337");
  });
});

describe("normalizarDataBR", () => {
  it("completes the two-digit year and pads, so the agent never says 6/6/26", () => {
    // Os dois formatos convivem na mesma coluna do CSV real.
    expect(normalizarDataBR("30/07/26")).toBe("30/07/2026");
    expect(normalizarDataBR("6/6/26")).toBe("06/06/2026");
    expect(normalizarDataBR("10/06/2026")).toBe("10/06/2026");
  });

  it("leaves anything that is not a date untouched", () => {
    expect(normalizarDataBR("")).toBe("");
    expect(normalizarDataBR("a combinar")).toBe("a combinar");
  });
});

describe("parseSheetRecusados", () => {
  it("surfaces the rows that cannot be dispatched instead of dropping them", () => {
    const rows = [
      { Celular: "(44) 99171-8337", Cliente: "761 - WILLIAN", Receber: "404,13", "Ser/Doc/Par": "CxPhM 991 1/1" },
      { Telefone: "(43) 3253-1641", Cliente: "14889 - BANDELAJES LTDA", Receber: "500,00", "Ser/Doc/Par": "CxPhL 1 1/1" },
      { Telefone: "", Celular: "", Cliente: "999 - SEM CONTATO", Receber: "100,00", "Ser/Doc/Par": "CxPhL 2 1/1" },
    ];

    const recusados = parseSheetRecusados(rows);

    expect(recusados).toHaveLength(2);
    expect(recusados.map((r) => r.motivo)).toEqual(["fixo", "vazio"]);
    expect(recusados[0].nome).toBe("BANDELAJES LTDA");
    expect(recusados[0].documento).toBe("CxPhL 1 1/1");
    // O boleto do WILLIAN continua disparável.
    expect(parseSheetLeads(rows)).toHaveLength(1);
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

  it("ignores a fractional serial, which only SheetJS invents from ambiguous text", () => {
    // Caso real do CSV: a coluna diz "10/6/26". Pedindo o valor cru, o SheetJS
    // lê no padrão americano e devolve 46301,99967 — 6 de outubro. Ele faz isso
    // só com as datas ambíguas: "15/07/26" ele deixa string, porque 15 não pode
    // ser mês. Uma célula de data do ERP é sempre inteira.
    const [row] = mergeDateSerials([{ Prorrog: "10/6/26" }], [{ Prorrog: 46301.99967592592 }]);
    expect(row.Prorrog).toBe("10/06/2026");
  });

  it("leaves CSV rows alone, where every cell is already text", () => {
    const rows = [{ Prorrog: "10/06/2026", Receber: "530,00" }];
    expect(mergeDateSerials(rows, rows)).toEqual(rows);
  });
});

describe("normalizarDatasTexto", () => {
  it("is the CSV path: the text wins, never a serial SheetJS guessed", () => {
    const rows = [{ Prorrog: "10/6/26", "Emissão": "17/04/26", Receber: "180,87" }];
    const [row] = normalizarDatasTexto(rows);
    expect(row.Prorrog).toBe("10/06/2026");
    expect(row["Emissão"]).toBe("17/04/2026");
    expect(row.Receber).toBe("180,87");
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
