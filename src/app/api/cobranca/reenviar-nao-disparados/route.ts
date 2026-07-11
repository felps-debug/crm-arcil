import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PYTHON_BASE_URL = (process.env.PYTHON_BASE_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host").trim().replace(/^﻿/, "");

const COBRANCA_ROLES = ["superadmin", "owner", "manager"];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).single();
  if (!profile || !COBRANCA_ROLES.includes(String(profile.role))) {
    return Response.json({ error: "Sem permissão" }, { status: 403 });
  }

  let pythonStatus: string;
  try {
    const r = await fetch(`${PYTHON_BASE_URL}/reenviar-nao-disparados`, { method: "POST" });
    pythonStatus = `ok:${r.status}`;
    if (!r.ok) {
      console.error("[REENVIO] Python respondeu erro:", r.status);
      return Response.json(
        { ok: false, error: `Serviço de cobrança respondeu ${r.status} — reenvio não confirmado`, pythonStatus },
        { status: 502 }
      );
    }
  } catch (err) {
    pythonStatus = `erro:${String(err)}`;
    console.error("[REENVIO] Falha ao chamar Python:", err);
    return Response.json(
      { ok: false, error: "Falha ao contatar o serviço de cobrança — reenvio não realizado", pythonStatus },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, pythonStatus });
}
