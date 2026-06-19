import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type DisparoLead = Record<string, string>;

const PYTHON_COBRANCA_URL = (process.env.PYTHON_COBRANCA_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca").trim().replace(/^﻿/, "");

// Só quem tem permissão de gerenciar cobrança (ver ROLE_PERMISSIONS em /api/admin/users)
// pode disparar mensagens reais de cobrança para números de telefone.
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

  let pythonStatus: string | null = null;
  try {
    const r = await fetch(PYTHON_COBRANCA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads }),
    });
    pythonStatus = `ok:${r.status}`;
  } catch (err) {
    pythonStatus = `erro:${String(err)}`;
    console.error("[DISPARO] Falha ao chamar Python:", err);
  }

  return Response.json({ ok: true, disparados: leads.length, pythonStatus });
}
