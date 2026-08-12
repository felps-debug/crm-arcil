import { requireApiUser } from "@/lib/server/api-auth";

/**
 * Liturgia diária, consumida de uma fonte pública.
 *
 * O CRM NUNCA gera texto litúrgico. Se a fonte não responder, a rota devolve
 * `available: false` e a tela mostra isso — um resumo inventado seria lido pelo
 * Paulo como a leitura real do dia.
 */
const SOURCE = "https://liturgia.up.railway.app/v2";

type Leitura = { referencia?: string; titulo?: string; texto?: string; refrao?: string };

type LiturgiaSource = {
  data?: string;
  liturgia?: string;
  cor?: string;
  leituras?: {
    primeiraLeitura?: Leitura[];
    salmo?: Leitura[];
    segundaLeitura?: Leitura[];
    evangelho?: Leitura[];
  };
};

export type LiturgiaResponse = {
  available: boolean;
  /** Presente só quando `available` é false — a tela mostra este texto. */
  reason?: string;
  data?: string;
  liturgia?: string;
  cor?: string;
  evangelho?: { referencia: string; titulo: string; texto: string };
  primeiraLeitura?: { referencia: string; titulo: string };
  salmo?: { referencia: string; refrao: string };
};

// A liturgia muda uma vez por dia. Guardar por data evita bater na fonte a cada
// carga do painel e mantém a tela viva se ela cair no meio do expediente.
let cache: { key: string; body: LiturgiaResponse } | undefined;

function today() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function first(list: Leitura[] | undefined) {
  return Array.isArray(list) && list.length ? list[0] : undefined;
}

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  const key = today();
  if (cache?.key === key && cache.body.available) return Response.json(cache.body);

  try {
    const upstream = await fetch(SOURCE, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!upstream.ok) throw new Error(`fonte respondeu ${upstream.status}`);

    const source = (await upstream.json()) as LiturgiaSource;
    const evangelho = first(source.leituras?.evangelho);
    const primeira = first(source.leituras?.primeiraLeitura);
    const salmo = first(source.leituras?.salmo);

    // Sem evangelho não há o que resumir; melhor dizer que não veio do que
    // montar um card meio vazio que parece quebrado.
    if (!evangelho?.texto) throw new Error("resposta sem evangelho");

    const body: LiturgiaResponse = {
      available: true,
      data: source.data,
      liturgia: source.liturgia,
      cor: source.cor,
      evangelho: {
        referencia: evangelho.referencia ?? "",
        titulo: evangelho.titulo ?? "",
        texto: evangelho.texto,
      },
      primeiraLeitura: primeira ? { referencia: primeira.referencia ?? "", titulo: primeira.titulo ?? "" } : undefined,
      salmo: salmo ? { referencia: salmo.referencia ?? "", refrao: salmo.refrao ?? "" } : undefined,
    };

    cache = { key, body };
    return Response.json(body);
  } catch (error) {
    console.error("[liturgia]", error);
    // Se já temos a liturgia de hoje em memória, ela vale mais que o erro.
    if (cache?.key === key) return Response.json(cache.body);
    return Response.json({
      available: false,
      reason: "Liturgia do dia indisponível no momento.",
    } satisfies LiturgiaResponse);
  }
}
