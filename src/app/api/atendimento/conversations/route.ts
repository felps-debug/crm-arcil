import { requireAtendimentoScope, handleApiError } from "@/lib/server/api-auth";
import { listConversations, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";
import { inboxesToQuery, mergeConversationLists } from "@/lib/server/inbox-scope";

export async function GET(request: Request) {
  const { scopedInboxIds, response } = await requireAtendimentoScope();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    // O escopo (vendor/employee/installer_manager) manda sobre o filtro da URL:
    // um inbox fora da lista cai na lista inteira, então editar a URL não amplia a visão.
    const requestedInboxId = url.searchParams.get("inboxId");
    const inboxIds = inboxesToQuery(scopedInboxIds, requestedInboxId ? Number(requestedInboxId) : null);

    // Quantas páginas de 25 buscar. A tela começa com 2 e pede mais conforme o
    // usuário rola — o Chatwoot tem 3.096 conversas, ler tudo seriam 124
    // chamadas em série antes de a tela abrir.
    const paginas = Number(url.searchParams.get("paginas") ?? 2);

    // O Chatwoot filtra por um inbox por vez: vários inboxes = uma busca por inbox, em paralelo.
    const lista = mergeConversationLists(
      await Promise.all(
        (inboxIds ?? [undefined]).map((inboxId) =>
          listConversations({
            ...(status ? { status } : {}),
            ...(inboxId != null ? { inboxId } : {}),
            paginas,
          })
        )
      )
    );
    // Lets the UI know the caller is restricted to a list of inboxes.
    return Response.json({ ...lista, scoped: scopedInboxIds != null });
  } catch (error) {
    if (error instanceof ChatwootNotConfiguredError) {
      return Response.json({ error: error.message, code: "chatwoot_not_configured" }, { status: 503 });
    }
    if (error instanceof ChatwootApiError) {
      console.error("[atendimento/conversations]", error);
      return Response.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
