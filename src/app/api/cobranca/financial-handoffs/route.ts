import { getFinancialHandoffBoard } from "@/lib/server/crm-data";
import { requireApiPermission } from "@/lib/server/api-auth";

export async function GET() {
  const { response } = await requireApiPermission("manage_cobranca");
  if (response) return response;

  try {
    return Response.json({ items: await getFinancialHandoffBoard() });
  } catch (error) {
    console.error("[financial-handoffs] board load failed", error);
    return Response.json({ error: "Não foi possível carregar os atendimentos financeiros." }, { status: 500 });
  }
}
