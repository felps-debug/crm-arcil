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
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiPermission("manage_cobranca");
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

    try {
      await notifyFinancialHandoffN8n({
        resolutionId: result.resolution_id,
        leadId,
        phone: result.wa_phone,
        destination: result.destination,
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
