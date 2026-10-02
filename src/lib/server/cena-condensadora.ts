import { N8N_CONDENSADORA_WEBHOOK } from "@/lib/env";
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
