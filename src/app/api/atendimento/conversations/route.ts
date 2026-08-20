import { requireAtendimentoScope, handleApiError } from "@/lib/server/api-auth";
import { listConversations, ChatwootNotConfiguredError, ChatwootApiError } from "@/lib/chatwoot/client";

export async function GET(request: Request) {
  const { scopedInboxId, response } = await requireAtendimentoScope();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    // scopedInboxId (vendor/employee) always wins over the client-supplied
    // filter — a scoped caller can't widen their own view by editing the URL.
    const requestedInboxId = url.searchParams.get("inboxId");
    const inboxId = scopedInboxId ?? (requestedInboxId ? Number(requestedInboxId) : undefined);

    // Quantas páginas de 25 buscar. A tela começa com 2 e pede mais conforme o
    // usuário rola — o Chatwoot tem 3.096 conversas, ler tudo seriam 124
    // chamadas em série antes de a tela abrir.
    const paginas = Number(url.searchParams.get("paginas") ?? 2);

    const lista = await listConversations({
      ...(status ? { status } : {}),
      ...(inboxId != null ? { inboxId } : {}),
      paginas,
    });
    // Lets the UI hide the inbox filter dropdown for scoped (vendor) callers —
    // picking a different inbox there wouldn't change anything since
    // scopedInboxId always wins server-side anyway.
    return Response.json({ ...lista, scoped: scopedInboxId != null });
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
