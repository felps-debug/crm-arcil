import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type DisparoLead = Record<string, string>;

const PYTHON_COBRANCA_URL = (process.env.PYTHON_COBRANCA_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca").trim().replace(/^﻿/, "");

const COBRANCA_ROLES = ["superadmin", "owner", "manager"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).single();
  if (!profile || !COBRANCA_ROLES.includes(String(profile.role))) {
    return Response.json({ error: "Sem permissão para disparar cobrança" }, { status: 403 });
  }

  const { leads }: { leads: DisparoLead[] } = await req.json();
  if (!leads?.length) return Response.json({ error: "Nenhum lead fornecido" }, { status: 400 });

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

  return Response.json({ ok: true, inserted: leads.length, pythonStatus });
}
