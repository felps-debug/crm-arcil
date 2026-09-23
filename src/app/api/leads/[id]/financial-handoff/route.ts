import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, requireApiPermission } from "@/lib/server/api-auth";
import {
  FinancialHandoffValidationError,
  notifyFinancialHandoffN8n,
  parseFinancialHandoffPayload,
} from "@/lib/server/financial-handoff";

type ResolutionResult = {
  resolution_id: string;
  wa_phone: string;
  destination: "devolver_ao_bot" | "sem_retorno";
  /** Quando o bot pode voltar a falar com o cliente. Preenchido só em
   *  `sem_retorno`; é o que o n8n usa para calcular por quanto tempo manter o
   *  bloqueio no Redis. */
  followup_at: string | null;
  /** `false` quando o cliente nunca saiu do atendimento automático — o
   *  financeiro está apenas baixando boleto. */
  tinha_handoff: boolean;
};

/**
 * Reenvia ao n8n uma resolução que ficou como `failed`.
 *
 * A decisão financeira já está gravada; o que faltou foi liberar o bot. Sem
 * este reenvio, a única saída do vendedor era clicar em "confirmar" de novo —
 * o que grava uma resolução duplicada para o mesmo atendimento. Três delas
 * foram parar no banco assim, no dia em que o host do n8n ficou fora do ar.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiPermission("manage_cobranca", { strict: true });
  if (response) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const resolutionId = typeof (body as Record<string, unknown>)?.resolutionId === "string"
    ? ((body as Record<string, unknown>).resolutionId as string)
    : "";
  if (!resolutionId) return Response.json({ error: "Resolução inválida" }, { status: 400 });

  const { id: leadId } = await context.params;
  const admin = createAdminClient();

  const { data: resolucao, error: erroBusca } = await admin
    .from("financial_handoff_resolutions")
    .select("id,lead_id,destination,followup_at,n8n_status")
    .eq("id", resolutionId)
    .eq("lead_id", leadId)
    .single();

  if (erroBusca || !resolucao) return Response.json({ error: "Resolução não encontrada" }, { status: 404 });
  if (resolucao.n8n_status === "delivered") {
    return Response.json({ ok: true, jaEntregue: true });
  }

  const { data: lead } = await admin.from("leads").select("wa_phone").eq("id", leadId).single();
  if (!lead?.wa_phone) return Response.json({ error: "Lead sem telefone cadastrado" }, { status: 400 });

  try {
    await notifyFinancialHandoffN8n({
      resolutionId: resolucao.id,
      leadId,
      phone: lead.wa_phone,
      destination: resolucao.destination as "devolver_ao_bot" | "sem_retorno",
      followupAt: resolucao.followup_at,
    });
    await admin
      .from("financial_handoff_resolutions")
      .update({ n8n_status: "delivered", n8n_delivered_at: new Date().toISOString(), n8n_error: null })
      .eq("id", resolucao.id);
    return Response.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida";
    await admin
      .from("financial_handoff_resolutions")
      .update({ n8n_status: "failed", n8n_error: mensagem.slice(0, 500) })
      .eq("id", resolucao.id);
    return Response.json({ ok: false, error: `Ainda não consegui falar com a automação (${mensagem}).` }, { status: 502 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiPermission("manage_cobranca", { strict: true });
  if (response) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const payload = parseFinancialHandoffPayload(body);
    const input = body as Record<string, unknown>;
    const cobrancaLogId = typeof input.cobrancaLogId === "string" ? input.cobrancaLogId.trim() : "";
    if (!cobrancaLogId) return Response.json({ error: "Snapshot de cobrança inválido" }, { status: 400 });

    const { id: leadId } = await context.params;
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("finalize_financial_handoff", {
      p_lead_id: leadId,
      p_actor_id: user!.id,
      p_destination: payload.destination,
      p_cobranca_log_id: cobrancaLogId,
      p_decisions: payload.decisions,
    });

    if (error) {
      if (error.code === "P0001") return Response.json({ error: error.message }, { status: 400 });
      return handleApiError(error);
    }

    const result = Array.isArray(data) ? data[0] as ResolutionResult | undefined : undefined;
    if (!result?.resolution_id || !result.wa_phone) {
      return Response.json({ error: "Não foi possível registrar o encerramento" }, { status: 500 });
    }

    // Sem handoff não existe bloqueio de bot para liberar: avisar o n8n aqui
    // mandaria apagar uma chave que nunca foi criada, e um erro de rede nessa
    // chamada marcaria como "falhou" uma baixa de boleto que deu certo.
    if (!result.tinha_handoff) {
      // Este era o único dos três updates da rota que não conferia o erro, e
      // a constraint de n8n_status não aceitava "not_applicable". A recusa
      // era engolida e 12 resoluções ficaram no DEFAULT "pending", parecendo
      // entrega travada quando não havia nada a entregar.
      const { error: naoAplicavelError } = await admin
        .from("financial_handoff_resolutions")
        .update({ n8n_status: "not_applicable" })
        .eq("id", result.resolution_id);
      if (naoAplicavelError) console.error("[financial-handoff] não marcou not_applicable:", naoAplicavelError);
      return Response.json({ ok: true, resolutionId: result.resolution_id, destination: result.destination, semHandoff: true });
    }

    try {
      await notifyFinancialHandoffN8n({
        resolutionId: result.resolution_id,
        leadId,
        phone: result.wa_phone,
        destination: result.destination,
        followupAt: result.followup_at,
      });

      const { error: deliveryError } = await admin
        .from("financial_handoff_resolutions")
        .update({ n8n_status: "delivered", n8n_delivered_at: new Date().toISOString(), n8n_error: null })
        .eq("id", result.resolution_id);
      if (deliveryError) console.error("[financial-handoff] não registrou entrega n8n:", deliveryError);

      return Response.json({ ok: true, resolutionId: result.resolution_id, destination: result.destination });
    } catch (notifyError) {
      const message = notifyError instanceof Error ? notifyError.message : "Falha desconhecida";
      const { error: deliveryError } = await admin
        .from("financial_handoff_resolutions")
        .update({ n8n_status: "failed", n8n_error: message.slice(0, 500) })
        .eq("id", result.resolution_id);
      if (deliveryError) console.error("[financial-handoff] não registrou falha n8n:", deliveryError);

      return Response.json(
        { ok: false, pending: true, error: "Não foi possível devolver o atendimento ao bot. A decisão financeira foi salva com segurança." },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof FinancialHandoffValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
