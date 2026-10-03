import { N8N_CONDENSADORA_WEBHOOK, SUPABASE_URL } from "@/lib/env";
import type { LocalCondensadora } from "@/lib/alertas-instalacao";

/**
 * Pede ao n8n a cena ilustrativa da condensadora instalada no tipo de local
 * escolhido (não é o local real do cliente — não temos foto dele). Usado pela
 * geração principal (em paralelo) e pelo botão sob demanda do painel.
 *
 * Lança em qualquer falha: quem chama decide o fallback.
 */
export async function gerarCenaCondensadora(args: {
  leadId: string;
  tipoLocal: LocalCondensadora;
  productImageBase64: string | null;
}): Promise<string> {
  const res = await fetch(N8N_CONDENSADORA_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      lead_id: args.leadId,
      tipo_local: args.tipoLocal,
      product_image_base64: args.productImageBase64 ? `data:image/jpeg;base64,${args.productImageBase64}` : null,
    }),
  });
  const texto = await res.text();
  if (!res.ok || !texto.trim()) throw new Error(`n8n condensadora HTTP ${res.status}: ${texto.slice(0, 300) || "(corpo vazio)"}`);
  const url = (JSON.parse(texto) as Record<string, unknown>).url_imagem_final;
  if (typeof url !== "string" || !url) throw new Error("n8n condensadora não devolveu url_imagem_final");
  return url;
}

/**
 * A cena da condensadora é uma ilustração genérica (tipo de local + aparelho
 * do catálogo), não o local do cliente: para o mesmo produto e o mesmo local
 * ela sai igual. Por isso fica guardada e é reaproveitada — só a primeira
 * prévia de cada combinação paga a geração (~R$ 0,80).
 *
 * A chave vira o `lead_id` mandado ao n8n, e o nó "Sobe no Storage" grava em
 * `PDF/condensadora-{lead_id}-{tipo_local}`: o caminho é determinístico, então
 * dá para saber se já existe antes de pedir. Para refazer uma cena ruim, basta
 * apagar o arquivo no bucket `PDF`.
 */
export function chaveCacheCondensadora(
  codigoErp: string | null | undefined,
  tipoLocal: LocalCondensadora
): { leadId: string; url: string } | null {
  const codigo = (codigoErp ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!codigo) return null;
  const leadId = `cache-${codigo}`;
  return { leadId, url: `${SUPABASE_URL}/storage/v1/object/public/PDF/condensadora-${leadId}-${tipoLocal}` };
}

/** Cena da condensadora: do cache quando existe, gerada (e guardada) quando não. */
export async function cenaCondensadoraComCache(args: {
  codigoErp: string | null | undefined;
  tipoLocal: LocalCondensadora;
  productImageBase64: string | null;
  leadIdSemCache: string;
}): Promise<string> {
  const chave = chaveCacheCondensadora(args.codigoErp, args.tipoLocal);
  if (chave) {
    try {
      const existe = await fetch(chave.url, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
      if (existe.ok) return chave.url;
    } catch {
      // Sem resposta do Storage: gera, como se não houvesse cache.
    }
  }
  return gerarCenaCondensadora({ leadId: chave?.leadId ?? args.leadIdSemCache, tipoLocal: args.tipoLocal, productImageBase64: args.productImageBase64 });
}
