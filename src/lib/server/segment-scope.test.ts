import { describe, expect, it } from "vitest";
import type { CoreData } from "./crm-data";
import { segmentScope, VALID_ROLES, ROLE_PERMISSIONS } from "./roles";
import { scopeCore, scopeLeadDetail, scopePending, scopeSummary } from "./segment-scope";
import type { DashboardSummaryResponse, LeadDetailResponse, PendingCenterResponse } from "@/types/api";

const core = {
  leads: [
    { id: "i1", segment: "INSTALLER", wa_phone: "5543911110001" },
    { id: "i2", segment: "INSTALLER", wa_phone: "5543911110002" },
    { id: "c1", segment: "CONSUMER", wa_phone: "5543911110003" },
    { id: "b1", segment: "COBRANCA", wa_phone: "5543911110004" },
  ],
  followups: [
    { id: 1, lead_id: "i1" },
    { id: 2, lead_id: "c1" },
    { id: 3, lead_id: null, numero_cliente: "5543911110002" },
    { id: 4, lead_id: null, numero_cliente: "5543911110003" },
  ],
  conversations: [
    { id: "v1", lead_id: "i1", vendor_id: "thiago" },
    { id: "v2", lead_id: "c1", vendor_id: "ana" },
  ],
  vendors: [
    { id: "thiago", name: "Thiago", segment: ["INSTALLER"] },
    { id: "ana", name: "Ana Paula", segment: ["CONSUMER", "RESELLER"] },
    { id: "cob", name: "Cobrança", segment: ["COBRANCA"] },
  ],
  cobrancas: [{ id: "x", telefone: "5543911110004" }],
  quotes: [
    { id: "q1", lead_id: "i1" },
    { id: "q2", lead_id: "c1" },
  ],
  sales: [
    { id: "s1", lead_id: "i2" },
    { id: "s2", lead_id: "c1" },
  ],
} as unknown as CoreData;

describe("papel installer_manager", () => {
  it("existe entre os papéis válidos e escopa ao segmento INSTALLER", () => {
    expect(VALID_ROLES).toContain("installer_manager");
    expect(segmentScope("installer_manager")).toBe("INSTALLER");
  });

  it("nenhum outro papel tem escopo", () => {
    for (const role of VALID_ROLES.filter((r) => r !== "installer_manager")) {
      expect(segmentScope(role)).toBeNull();
    }
    expect(segmentScope("")).toBeNull();
  });

  it("não nasce com nenhum módulo de gestão", () => {
    const perms = ROLE_PERMISSIONS.installer_manager;
    expect(Object.keys(perms).filter((k) => k.startsWith("manage_") || k === "view_all")).toEqual([]);
  });
});

describe("scopeCore", () => {
  const scoped = scopeCore(core, "INSTALLER");

  it("mantém só leads do segmento", () => {
    expect(scoped.leads.map((l) => l.id)).toEqual(["i1", "i2"]);
  });

  it("follow-up, conversa, orçamento e venda só dos leads do segmento (follow-up também por telefone)", () => {
    expect(scoped.followups.map((f) => f.id)).toEqual([1, 3]);
    expect(scoped.conversations.map((c) => c.id)).toEqual(["v1"]);
    expect(scoped.quotes.map((q) => q.id)).toEqual(["q1"]);
    expect(scoped.sales.map((s) => s.id)).toEqual(["s1"]);
  });

  it("só agentes do segmento, e nenhuma cobrança", () => {
    expect(scoped.vendors.map((v) => v.id)).toEqual(["thiago"]);
    expect(scoped.cobrancas).toEqual([]);
  });

  it("não altera o núcleo original", () => {
    expect(core.leads).toHaveLength(4);
  });
});

describe("scopeSummary", () => {
  const metric = (id: string) => ({ id, label: id, value: 1 });
  const summary = {
    metrics: ["total_leads", "received_revenue", "open_collections", "produtos_disponiveis", "agent_conversations"].map(metric),
    commercialIndicators: [metric("new_leads_30d")],
  } as unknown as DashboardSummaryResponse;

  it("tira dinheiro de cobrança e estoque, mantém o resto", () => {
    const out = scopeSummary(summary);
    expect(out.metrics.map((m) => m.id)).toEqual(["total_leads", "agent_conversations"]);
    expect(out.commercialIndicators).toHaveLength(1);
  });
});

describe("scopePending", () => {
  it("tira a fila de cobranças que vencem hoje", () => {
    const pending = {
      items: [{ id: "leads_without_owner" }, { id: "collections_due_today" }],
    } as unknown as PendingCenterResponse;
    expect(scopePending(pending).items.map((i) => i.id)).toEqual(["leads_without_owner"]);
  });
});

describe("scopeLeadDetail", () => {
  const detail = (segment: string) =>
    ({
      lead: { id: "i1", segment },
      summary: { conversations: 2, messages: 9, followups: 1, collections: 3, generatedImages: 1, quotes: 1, sales: 0 },
      nextAction: null,
      timeline: [
        { id: "1", type: "lead" },
        { id: "2", type: "conversation" },
        { id: "3", type: "message" },
        { id: "4", type: "followup" },
        { id: "5", type: "collection" },
        { id: "6", type: "image" },
        { id: "7", type: "quote" },
      ],
      financialHandoff: { eligible: true, boletos: [] },
    }) as unknown as LeadDetailResponse;

  it("lead de outro segmento some (null → 404)", () => {
    expect(scopeLeadDetail(detail("CONSUMER"), "INSTALLER")).toBeNull();
  });

  it("tira conversa, mensagem, cobrança e financeiro; zera os contadores correspondentes", () => {
    const out = scopeLeadDetail(detail("INSTALLER"), "INSTALLER")!;
    expect(out.timeline.map((t) => t.type)).toEqual(["lead", "followup", "image", "quote"]);
    expect(out.financialHandoff).toBeNull();
    expect(out.summary).toMatchObject({ conversations: 0, messages: 0, collections: 0, followups: 1, quotes: 1 });
  });
});
