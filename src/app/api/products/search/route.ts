import { requireApiPermission, handleApiError } from "@/lib/server/api-auth";
import { searchProducts } from "@/lib/server/crm-data";

export async function GET(request: Request) {
  const { response } = await requireApiPermission("manage_gerador_imagem");
  if (response) return response;

  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      await searchProducts({
        q: params.get("q") ?? "",
        limit: Number(params.get("limit") ?? 20),
        // O gerador de imagem desenha o aparelho instalado, então lista só
        // aparelho inteiro. Sem isso a busca por "cassete 24000" devolve também
        // o PAINEL e as duas metades, e o vendedor escolhe a peça errada.
        apenasAparelhos: params.get("apenasAparelhos") === "1",
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}
