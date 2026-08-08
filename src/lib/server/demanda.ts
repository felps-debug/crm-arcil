/* ================================================================
   ARCIL CRM — Demanda não atendida
   ================================================================
   O agente grava em `out_of_stock_requests` o que o cliente pediu e ele não
   conseguiu atender. O campo é texto livre, do jeito que o cliente falou:

     "Split Hi Wall 12000 BTU LG até R$ 4000"
     "LG split 12000 BTUs até 3000"
     "split 12000 BTUs inverter até R$ 3000"

   Agrupar por `product_name` daria um grupo de tamanho 1 para cada linha — as
   16 solicitações de hoje são 16 strings distintas. O sinal está dentro do
   texto: BTU e marca. É por eles que compras consegue decidir alguma coisa.
   ================================================================ */

export type TermoDemanda = {
  termo: string;
  tipo: "btu" | "marca";
  total: number;
  /** Só para marca: se ela existe no catálogo. Marca muito pedida e ausente do
   *  catálogo é o achado mais útil desta tela. */
  noCatalogo: boolean | null;
};

/** Marcas de mercado que a ARCIL pode não revender. Sem esta lista, uma marca
 *  procurada que não está no catálogo seria invisível — que é justamente o caso
 *  que interessa a compras. */
const MARCAS_DE_MERCADO = [
  "SAMSUNG",
  "LG",
  "MIDEA",
  "PANASONIC",
  "FUJITSU",
  "KOMECO",
  "BOSCH",
  "RHEEM",
  "YORK",
  "TRANE",
  "DAIKIN",
];

const MARCA_SEM_VALOR = "NAO DEFINIDA";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** "7.000 BTUs" · "12000 BTU" · "9000btu" → "7000" · "12000" · "9000" */
export function extrairBtu(texto: string): string | null {
  const m = normalizar(texto).match(/(\d{1,2})[.,]?(\d{3})\s*BTU/);
  return m ? String(Number(m[1] + m[2])) : null;
}

export function extrairMarca(texto: string, vocabulario: string[]): string | null {
  const alvo = normalizar(texto);
  // Maior primeiro: senão "SPRINGER MIDEA" seria classificada como "MIDEA".
  for (const marca of [...vocabulario].sort((a, b) => b.length - a.length)) {
    const escapada = marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Z0-9])${escapada}([^A-Z0-9]|$)`).test(alvo)) return marca;
  }
  return null;
}

/**
 * Top de demanda não atendida, por BTU e por marca.
 *
 * `marcasDoCatalogo` vem das próprias tabelas de produto, então a lista não
 * precisa ser mantida à mão quando a ARCIL passa a revender uma marca nova.
 */
export function agruparDemanda(
  pedidos: { productName: string | null }[],
  marcasDoCatalogo: string[],
): TermoDemanda[] {
  const catalogo = new Set(
    marcasDoCatalogo.map(normalizar).filter((m) => m && m !== MARCA_SEM_VALOR),
  );
  const vocabulario = [...new Set([...catalogo, ...MARCAS_DE_MERCADO])];

  const porBtu = new Map<string, number>();
  const porMarca = new Map<string, number>();

  for (const { productName } of pedidos) {
    if (!productName) continue;
    const btu = extrairBtu(productName);
    if (btu) porBtu.set(btu, (porBtu.get(btu) ?? 0) + 1);
    const marca = extrairMarca(productName, vocabulario);
    if (marca) porMarca.set(marca, (porMarca.get(marca) ?? 0) + 1);
  }

  return [
    ...[...porBtu].map(([termo, total]): TermoDemanda => ({
      termo: `${Number(termo).toLocaleString("pt-BR")} BTU`,
      tipo: "btu",
      total,
      noCatalogo: null,
    })),
    ...[...porMarca].map(([termo, total]): TermoDemanda => ({
      termo,
      tipo: "marca",
      total,
      noCatalogo: catalogo.has(termo),
    })),
  ].sort((a, b) => b.total - a.total || a.termo.localeCompare(b.termo, "pt-BR"));
}
