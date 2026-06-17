import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type DisparoLead = Record<string, string>;

const PYTHON_COBRANCA_URL = process.env.PYTHON_COBRANCA_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca";

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
    // Guarda a linha completa da planilha (todas as colunas originais do ERP) para consulta futura
    metadata: l,
  }));

  const { error } = await supabase.from("cobranca_log").insert(records);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Envia para a automação Python o array completo com todos os campos do ERP + numero + tag
  try {
    await fetch(PYTHON_COBRANCA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leads),
    });
  } catch {}

  return Response.json({ ok: true, inserted: records.length });
}
