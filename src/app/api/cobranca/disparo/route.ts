import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiPermission } from "@/lib/server/api-auth";

type DisparoLead = Record<string, string>;

const PYTHON_COBRANCA_URL = (process.env.PYTHON_COBRANCA_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca").trim().replace(/^﻿/, "");

const MAX_LEADS_PER_DISPARO = 1000;
const PHONE_RE = /^55\d{10,11}$/;

function validateLeads(leads: DisparoLead[]): string | null {
  if (leads.length > MAX_LEADS_PER_DISPARO) {
    return `Máximo de ${MAX_LEADS_PER_DISPARO} leads por disparo (recebido: ${leads.length})`;
  }
  for (const lead of leads) {
    const numero = lead["numero"];
    if (!numero || !PHONE_RE.test(numero)) {
      return `Telefone inválido: "${numero ?? ""}" — esperado DDI 55 + DDD + número (10-11 dígitos)`;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiPermission("manage_cobranca");
  if (response) return response;

  const { leads }: { leads: DisparoLead[] } = await req.json();
  if (!leads?.length) return Response.json({ error: "Nenhum lead fornecido" }, { status: 400 });

  const validationError = validateLeads(leads);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();

  // Build phone → boletos_json map before dispatch
  const boletosByPhone: Record<string, string> = {};
  for (const lead of leads) {
    if (lead["numero"] && lead["boletos_json"]) {
      boletosByPhone[lead["numero"]] = lead["boletos_json"];
    }
  }

  let pythonStatus: string;
  try {
    const r = await fetch(PYTHON_COBRANCA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads }),
    });
    pythonStatus = `ok:${r.status}`;
    if (!r.ok) {
      console.error("[DISPARO] Python respondeu erro:", r.status);
      return Response.json(
        { ok: false, error: `Serviço de cobrança respondeu ${r.status} — disparo não confirmado`, pythonStatus },
        { status: 502 }
      );
    }
  } catch (err) {
    pythonStatus = `erro:${String(err)}`;
    console.error("[DISPARO] Falha ao chamar Python:", err);
    return Response.json(
      { ok: false, error: "Falha ao contatar o serviço de cobrança — nada foi disparado", pythonStatus },
      { status: 502 }
    );
  }

  // After Python inserts the rows (synchronously before its response),
  // patch metadata.boletos_json for each phone so the drawer can show details.
  if (Object.keys(boletosByPhone).length > 0) {
    try {
      const cutoff = new Date(Date.now() - 90_000).toISOString();
      const phones = Object.keys(boletosByPhone);

      const { data: recentRows } = await admin
        .from("cobranca_log")
        .select("id, telefone, metadata")
        .in("telefone", phones)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });

      if (recentRows) {
        // Pick the most-recent row per phone (recentRows already ordered desc)
        const byPhone = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
        for (const row of recentRows) {
          if (row.telefone && !byPhone.has(row.telefone) && boletosByPhone[row.telefone]) {
            byPhone.set(row.telefone, { id: row.id, metadata: row.metadata });
          }
        }
        await Promise.all(
          [...byPhone.entries()].map(([phone, row]) =>
            // Merge: preserva a metadata gravada pelo ERP/Python (update substituiria a coluna inteira)
            admin.from("cobranca_log").update({
              metadata: { ...(row.metadata ?? {}), boletos_json: boletosByPhone[phone] },
            }).eq("id", row.id)
          )
        );
      }
    } catch (err) {
      console.error("[DISPARO] Falha ao salvar boletos_json no metadata:", err);
    }
  }

  await admin.from("activity_log").insert({
    entity_type: "cobranca_disparo",
    entity_id: crypto.randomUUID(),
    action: "disparo",
    metadata: { count: leads.length, pythonStatus, actor_id: user!.id },
    wf_origin: "crm",
  });

  return Response.json({ ok: true, inserted: leads.length, pythonStatus });
}
