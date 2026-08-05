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
  // O valor que o CRM calculou a partir da planilha, por telefone. O serviço de
  // cobrança grava esse campo com o valor multiplicado por 10 — uma cobrança de
  // R$ 471,50 virou R$ 4.715,00 no cobranca_log — e o serviço é um deploy
  // separado, fora deste repositório. Enquanto ele não for corrigido, o CRM
  // reescreve o campo com o número que ele mesmo somou da planilha.
  const valorByPhone: Record<string, string> = {};
  for (const lead of leads) {
    const phone = lead["numero"];
    if (!phone) continue;
    if (lead["boletos_json"]) boletosByPhone[phone] = lead["boletos_json"];
    const numerico = Number(lead["valor_numerico"]);
    if (Number.isFinite(numerico) && numerico > 0) {
      valorByPhone[phone] = numerico.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
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

  // O Python responde 200 mesmo quando descarta lead: um disparo de 2 gravou 1
  // e o CRM anunciou "2 leads inseridos". Confere o que realmente caiu na
  // tabela antes de dizer que deu certo.
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const allPhones = [...new Set(leads.map((l) => l["numero"]).filter(Boolean))];
  let confirmedPhones: string[] = [];
  try {
    const { data: landed } = await admin
      .from("cobranca_log")
      .select("telefone")
      .in("telefone", allPhones)
      .gte("created_at", cutoff);
    confirmedPhones = [...new Set((landed ?? []).map((r) => r.telefone).filter(Boolean) as string[])];
  } catch (err) {
    console.error("[DISPARO] Falha ao conferir linhas gravadas:", err);
  }
  const missingPhones = allPhones.filter((p) => !confirmedPhones.includes(p));

  // O Python insere as linhas antes de responder. Aqui o CRM corrige o que ele
  // sabe melhor: o valor somado da planilha e o detalhamento dos boletos.
  let valoresCorrigidos = 0;
  try {
    const phones = [...new Set([...Object.keys(boletosByPhone), ...Object.keys(valorByPhone)])];
    if (phones.length > 0) {
      const { data: recentRows } = await admin
        .from("cobranca_log")
        .select("id, telefone, valor, metadata")
        .in("telefone", phones)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });

      // Uma linha por telefone — recentRows já vem em ordem decrescente.
      const byPhone = new Map<string, { id: string; valor: string | null; metadata: Record<string, unknown> | null }>();
      for (const row of recentRows ?? []) {
        if (row.telefone && !byPhone.has(row.telefone)) {
          byPhone.set(row.telefone, { id: row.id, valor: row.valor, metadata: row.metadata });
        }
      }

      await Promise.all(
        [...byPhone.entries()].map(([phone, row]) => {
          const patch: Record<string, unknown> = {};
          if (boletosByPhone[phone]) {
            // Merge: preserva a metadata gravada pelo ERP/Python (update substituiria a coluna inteira)
            patch.metadata = { ...(row.metadata ?? {}), boletos_json: boletosByPhone[phone] };
          }
          if (valorByPhone[phone] && row.valor !== valorByPhone[phone]) {
            patch.valor = valorByPhone[phone];
            valoresCorrigidos += 1;
          }
          if (Object.keys(patch).length === 0) return Promise.resolve();
          return admin.from("cobranca_log").update(patch).eq("id", row.id);
        })
      );
    }
  } catch (err) {
    console.error("[DISPARO] Falha ao corrigir valor/boletos na cobranca_log:", err);
  }

  await admin.from("activity_log").insert({
    entity_type: "cobranca_disparo",
    entity_id: crypto.randomUUID(),
    action: "disparo",
    metadata: {
      count: leads.length,
      confirmed: confirmedPhones.length,
      missing: missingPhones,
      valoresCorrigidos,
      pythonStatus,
      actor_id: user!.id,
    },
    wf_origin: "crm",
  });

  return Response.json({
    ok: true,
    // `inserted` passa a ser o que existe na tabela, não o que foi enviado.
    inserted: confirmedPhones.length,
    sent: leads.length,
    missing: missingPhones,
    pythonStatus,
  });
}
