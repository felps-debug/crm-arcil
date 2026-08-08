import { describe, expect, it } from "vitest";
import { agruparDemanda, extrairBtu, extrairMarca } from "./demanda";

// As 16 solicitações reais de out_of_stock_requests em 08/08/2026.
const PEDIDOS_REAIS = [
  "Split Hi Wall 12000 BTU LG até R$ 4000",
  "LG split 12000 BTUs até 3000",
  "split 12000 BTUs inverter até R$ 3000",
  "Samsung split 12000 BTU ar condicionado",
  "ar condicionado split inverter 12000 BTU quente e frio",
  "ar condicionado samsung split",
  "ar condicionado split 9000 BTU Samsung",
  "ar condicionado split 7000 BTU LG",
  "Samsung split 7000 BTU ar condicionado",
  "ar condicionado split 7.000 BTUs Elgin",
  "tubo de cobre 1/4",
  "tubo de cobre 1/2",
  "tubo dreno PVC - mangueira de dreno",
  "canaleta para ar-condicionado",
  "suporte condensadora 400mm 450mm 500mm 800mm",
  "Samsung split 9000 BTU ar condicionado",
].map((productName) => ({ productName }));

// Amostra real de products_consumer/products_reseller. SAMSUNG não está aqui —
// a ARCIL não revende, e é justamente esse o achado.
const MARCAS_CATALOGO = ["CARRIER", "PHILCO", "SPRINGER MIDEA", "ELGIN", "GREE", "LG", "NÃO DEFINIDA"];

describe("extrairBtu", () => {
  it("reads BTU however the customer typed it", () => {
    expect(extrairBtu("Split Hi Wall 12000 BTU LG")).toBe("12000");
    expect(extrairBtu("ar condicionado split 7.000 BTUs Elgin")).toBe("7000");
    expect(extrairBtu("LG split 12000 BTUs até 3000")).toBe("12000");
    // "até R$ 4000" não é BTU: sem a palavra, não conta.
    expect(extrairBtu("split inverter até R$ 4000")).toBeNull();
    expect(extrairBtu("tubo de cobre 1/4")).toBeNull();
  });
});

describe("extrairMarca", () => {
  it("prefers the longest match so a compound brand is not cut in half", () => {
    expect(extrairMarca("ACJ SPRINGER MIDEA 220V", ["MIDEA", "SPRINGER MIDEA"])).toBe("SPRINGER MIDEA");
  });

  it("matches on word boundaries and ignores case and accents", () => {
    expect(extrairMarca("ar condicionado samsung split", ["SAMSUNG"])).toBe("SAMSUNG");
    // "LG" dentro de outra palavra não é a marca.
    expect(extrairMarca("algo grande", ["LG"])).toBeNull();
  });
});

describe("agruparDemanda", () => {
  const termos = agruparDemanda(PEDIDOS_REAIS, MARCAS_CATALOGO);
  const acha = (t: string) => termos.find((x) => x.termo === t);

  it("counts what the real requests actually asked for", () => {
    // Conferido no banco: 12000 BTU aparece em 5, 7000 em 3, 9000 em 2.
    expect(acha("12.000 BTU")?.total).toBe(5);
    expect(acha("7.000 BTU")?.total).toBe(3);
    expect(acha("9.000 BTU")?.total).toBe(2);
    expect(acha("SAMSUNG")?.total).toBe(5);
    // 3, não 4: "Elgin" contém "lg". Um LIKE '%lg%' conta a Elgin como LG — foi
    // o que aconteceu quando esse número foi conferido no banco a primeira vez.
    expect(acha("LG")?.total).toBe(3);
    expect(acha("ELGIN")?.total).toBe(1);
  });

  it("flags a sought-after brand that the catalogue does not carry", () => {
    // O achado que justifica a tela: 5 pedidos de Samsung, nenhum produto Samsung.
    expect(acha("SAMSUNG")?.noCatalogo).toBe(false);
    expect(acha("LG")?.noCatalogo).toBe(true);
  });

  it("ranks by volume, so the top of the list is what to buy first", () => {
    expect(termos.slice(0, 2).map((t) => t.termo)).toEqual(["12.000 BTU", "SAMSUNG"]);
  });

  it("ignores the placeholder brand from the ERP", () => {
    expect(agruparDemanda([{ productName: "algo NÃO DEFINIDA" }], MARCAS_CATALOGO)).toEqual([]);
  });
});
