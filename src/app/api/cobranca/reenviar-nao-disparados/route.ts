import { requireApiPermission } from "@/lib/server/api-auth";

const PYTHON_BASE_URL = (process.env.PYTHON_BASE_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host").trim().replace(/^﻿/, "");

export async function POST() {
  const { response } = await requireApiPermission("manage_cobranca");
  if (response) return response;

  let pythonStatus: string;
  try {
    // O serviço expõe /reenviar-pendentes ("Forcar Reenvio"). O caminho que
    // estava aqui, /reenviar-nao-disparados, devolve 404 — o botão "Reenviar
    // Não Disparados" nunca chegou a disparar nada.
    const r = await fetch(`${PYTHON_BASE_URL}/reenviar-pendentes`, { method: "POST" });
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
