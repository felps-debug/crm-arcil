import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("banco não deve ser tocado"); } }));

const { buildPending, isFollowupAtrasado, isLeadSemResponsavel } = await import("./crm-data");
import type { CoreData } from "./crm-data";

const horasAtras = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

type Lead = CoreData["leads"][number];
type Followup = CoreData["followups"][number];

const lead = (over: Partial<Lead>): Lead =>
  ({ id: "l", segment: "NEW", status: "ACTIVE", owner_name: null, handoff_vendor_id: null, created_at: horasAtras(5), ...over }) as Lead;

const followup = (over: Partial<Followup>): Followup =>
  ({
    id: 1,
    lead_id: "l",
    tipo: "lead",
    status: "PENDING",
    followup_sent: true,
    respondeu: false,
    created_at: horasAtras(100),
    updated_at: horasAtras(30),
    ultima_msg_ia: horasAtras(30),
    ...over,
  }) as Followup;

describe("Leads sem responsável", () => {
  it("só conta depois de 2h: antes disso a triagem ainda está conversando", () => {
    expect(isLeadSemResponsavel(lead({ created_at: horasAtras(1) }))).toBe(false);
    expect(isLeadSemResponsavel(lead({ created_at: horasAtras(3) }))).toBe(true);
  });

  it("encaminhado ou com dono não conta; cobrança também não", () => {
    expect(isLeadSemResponsavel(lead({ owner_name: "Ana" }))).toBe(false);
    expect(isLeadSemResponsavel(lead({ handoff_vendor_id: "v1" }))).toBe(false);
    expect(isLeadSemResponsavel(lead({ segment: "COBRANCA" }))).toBe(false);
  });
});

describe("Follow-ups atrasados", () => {
  const leads = new Map([
    ["l", lead({ id: "l" })],
    ["dev", lead({ id: "dev", segment: "COBRANCA" })],
  ]);

  it("conta pelo tempo desde a última mensagem da IA, não pela criação da linha", () => {
    expect(isFollowupAtrasado(followup({ ultima_msg_ia: horasAtras(30) }), leads)).toBe(true);
    // linha antiga, mas a IA falou há 3h: não está atrasado
    expect(isFollowupAtrasado(followup({ ultima_msg_ia: horasAtras(3), updated_at: horasAtras(3) }), leads)).toBe(false);
  });

  it("follow-up de cobrança fica fora (régua própria do financeiro)", () => {
    expect(isFollowupAtrasado(followup({ tipo: "cobranca" }), leads)).toBe(false);
    expect(isFollowupAtrasado(followup({ lead_id: "dev" }), leads)).toBe(false);
  });

  it("respondido ou não disparado não conta", () => {
    expect(isFollowupAtrasado(followup({ respondeu: true }), leads)).toBe(false);
    expect(isFollowupAtrasado(followup({ followup_sent: false }), leads)).toBe(false);
  });
});

describe("buildPending", () => {
  it("não tem mais 'Produtos sem estoque' nem as planilhas de prospecção", () => {
    const core = { leads: [], followups: [], cobrancas: [], conversations: [], vendors: [], quotes: [], sales: [] } as unknown as CoreData;
    const ids = buildPending(core).items.map((i) => i.id);
    expect(ids).not.toContain("out_of_stock_products");
    expect(ids).not.toContain("stale_integrations");
  });
});
