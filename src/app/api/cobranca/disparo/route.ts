import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DisparoLead = Record<string, string>;

const N8N_COBRANCA_WEBHOOK = process.env.N8N_COBRANCA_WEBHOOK || "https://arcil-n8n.47nukb.easypanel.host/webhook/cobranca";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { leads }: { leads: DisparoLead[] } = await req.json();
  if (!leads?.length) return Response.json({ error: "Nenhum lead fornecido" }, { status: 400 });

  const records = leads.map((l) => ({
    telefone: (l.numero ?? "").replace(/\D/g, ""),
    nome: l.nome || null,
    valor: l.valor || null,
    vencimento: l.vencimento || null,
    documento: l.documento || null,
    status_disparo: "PENDENTE",
    respondeu: false,
    pagamento_confirmado: false,
    data_disparo: new Date().toISOString(),
  }));

  const { error } = await supabase.from("cobranca_log").insert(records);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Envia para o n8n o array completo com todos os campos do ERP + numero + tag
  try {
    await fetch(N8N_COBRANCA_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leads),
    });
  } catch {}

  return Response.json({ ok: true, inserted: records.length });
}
