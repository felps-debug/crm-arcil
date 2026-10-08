import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("banco não deve ser tocado"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { buildDashboardSnapshot, parseSections, InvalidSectionError } = await import("./dashboard-snapshot");
import type { SnapshotLoaders } from "./dashboard-snapshot";
import type { ApiContext } from "./api-auth";
import type { CoreData } from "./crm-data";
import type { ProductMetrics } from "./product-metrics";

const metrics: ProductMetrics = {
  total_distintos: 10,
  com_estoque_conhecido: 8,
  disponiveis: 5,
  zerados: 3,
  estoque_baixo: 2,
  sincronizado: true,
};

const old = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

const core = {
  leads: [
    { id: "l1", name: "Ana", segment: "CONSUMIDOR", status: "ACTIVE", created_at: old, updated_at: old },
    { id: "l2", name: "Devedor", segment: "COBRANCA", status: "ACTIVE", created_at: old, updated_at: old },
  ],
  followups: [
    { id: 1, lead_id: "l1", followup_sent: true, respondeu: false, status: "PENDING", created_at: old, updated_at: old },
    { id: 2, lead_id: "l1", followup_sent: true, respondeu: true, status: "PENDING", created_at: old, updated_at: old, tipo: "D1" },
  ],
  conversations: [],
  vendors: [],
  cobrancas: [],
  quotes: [],
  sales: [],
} as unknown as CoreData;

function loaders(overrides: Partial<SnapshotLoaders> = {}) {
  const l: SnapshotLoaders = {
    core: vi.fn(async () => core),
    handoffDecisions: vi.fn(async () => []),
    productMetrics: vi.fn(async () => metrics),
    ...overrides,
  };
  return l;
}

const ctx = (role: string, permissions: Record<string, boolean> = {}): ApiContext => ({ userId: "u", role, permissions });
const ALL = ["summary", "pending", "agents", "inventory", "activity", "urgentFollowups"] as const;

describe("parseSections", () => {
  it("vazio devolve todas", () => expect(parseSections(null)).toEqual([...ALL]));
  it("filtra e deduplica", () => expect(parseSections("agents, summary,agents")).toEqual(["agents", "summary"]));
  it("nome desconhecido é erro", () => expect(() => parseSections("summary,foo")).toThrow(InvalidSectionError));
});

describe("buildDashboardSnapshot — permissões por seção", () => {
  it("client não vê atividade nem contagem urgente (antes a RLS barrava)", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("client"), [...ALL], loaders());
    expect(sections.activity).toEqual({ status: "forbidden" });
    expect(sections.urgentFollowups).toEqual({ status: "forbidden" });
    expect(sections.summary?.status).toBe("ok");
  });

  it("vendor sem manage_estoque não vê estoque; o resto carrega", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("vendor"), [...ALL], loaders());
    expect(sections.inventory).toEqual({ status: "forbidden" });
    expect(sections.pending?.status).toBe("ok");
    expect(sections.activity?.status).toBe("ok");
  });

  it("owner vê estoque", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["inventory"], loaders());
    expect(sections.inventory).toMatchObject({ status: "ok", data: { estoqueSincronizado: true } });
  });

  it("seção proibida nem carrega o dado", async () => {
    const l = loaders();
    await buildDashboardSnapshot(ctx("vendor"), ["inventory"], l);
    expect(l.productMetrics).not.toHaveBeenCalled();
  });
});

describe("buildDashboardSnapshot — carga", () => {
  it("lê o núcleo uma vez para todas as seções", async () => {
    const l = loaders();
    await buildDashboardSnapshot(ctx("owner"), [...ALL], l);
    expect(l.core).toHaveBeenCalledTimes(1);
    expect(l.productMetrics).toHaveBeenCalledTimes(1);
  });

  it("dispara todas as fontes juntas, sem esperar o núcleo terminar", async () => {
    let liberaCore!: () => void;
    const l = loaders({ core: vi.fn(() => new Promise<CoreData>((r) => { liberaCore = () => r(core); })) });
    const pronto = buildDashboardSnapshot(ctx("owner"), ["summary", "pending"], l);
    // O núcleo ainda não respondeu, e as outras fontes já saíram.
    expect(l.handoffDecisions).toHaveBeenCalled();
    expect(l.productMetrics).toHaveBeenCalled();
    liberaCore();
    await pronto;
  });

  it("só pede o que a seção precisa", async () => {
    const l = loaders();
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["agents"], l);
    expect(Object.keys(sections)).toEqual(["agents"]);
    expect(l.productMetrics).not.toHaveBeenCalled();
    expect(l.handoffDecisions).not.toHaveBeenCalled();
  });

  it("uma seção que falha não derruba as outras", async () => {
    const l = loaders({ handoffDecisions: vi.fn(async () => { throw new Error("decisoes fora"); }) });
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["summary", "pending"], l);
    expect(sections.summary).toEqual({ status: "error", message: "Erro ao carregar esta seção." });
    expect(sections.pending?.status).toBe("ok");
  });

  it("resumo e estoque usam o mesmo número de produto", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["summary", "inventory"], loaders());
    const s = sections.summary as { status: "ok"; data: { metrics: { id: string; value: unknown }[] } };
    const i = sections.inventory as { status: "ok"; data: { metrics: { id: string; value: unknown }[] } };
    expect(s.data.metrics.find((m) => m.id === "produtos_disponiveis")?.value).toBe(metrics.disponiveis);
    expect(i.data.metrics.find((m) => m.id === "total_products")?.value).toBe(metrics.total_distintos);
  });

  it("contagem urgente e atividade seguem as regras antigas", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("vendor"), ["urgentFollowups", "activity"], loaders());
    // só o follow-up 1: disparado, sem resposta, PENDING, parado há 72h
    expect(sections.urgentFollowups).toEqual({ status: "ok", data: { count: 1 } });
    const activity = (sections.activity as { status: "ok"; data: { type: string; label: string }[] }).data;
    // lead de cobrança fica fora; follow-up respondido entra
    expect(activity.map((a) => a.label)).toEqual(expect.arrayContaining(["Ana", "Follow-up respondido"]));
    expect(activity.map((a) => a.label)).not.toContain("Devedor");
  });
});

describe("buildDashboardSnapshot — papel preso a um segmento (installer_manager)", () => {
  const recent = new Date().toISOString();
  const mixed = {
    leads: [
      { id: "i1", name: "Instalador Zé", segment: "INSTALLER", status: "ACTIVE", created_at: recent, updated_at: recent },
      { id: "c1", name: "Consumidor Ana", segment: "CONSUMER", status: "ACTIVE", created_at: recent, updated_at: recent },
      { id: "b1", name: "Devedor", segment: "COBRANCA", status: "ACTIVE", created_at: recent, updated_at: recent },
    ],
    followups: [
      { id: 1, lead_id: "i1", followup_sent: true, respondeu: false, status: "PENDING", created_at: old, updated_at: old },
      { id: 2, lead_id: "c1", followup_sent: true, respondeu: false, status: "PENDING", created_at: old, updated_at: old },
    ],
    conversations: [
      { id: "v1", lead_id: "i1", vendor_id: "thiago", chatwoot_conv_id: "1" },
      { id: "v2", lead_id: "c1", vendor_id: "ana", chatwoot_conv_id: "2" },
    ],
    vendors: [
      { id: "thiago", name: "Thiago", segment: ["INSTALLER"], active: true },
      { id: "ana", name: "Ana Paula", segment: ["CONSUMER"], active: true },
    ],
    cobrancas: [{ id: "x", valor: "R$ 1.000,00", pagamento_confirmado: false, vencimento: null, data_disparo: recent, nome: "Devedor" }],
    quotes: [],
    sales: [],
  } as unknown as CoreData;

  const run = (sections: ("summary" | "pending" | "agents" | "inventory" | "activity" | "urgentFollowups")[]) =>
    buildDashboardSnapshot(ctx("installer_manager"), sections, loaders({ core: vi.fn(async () => mixed) }));

  type Ok<T> = { status: "ok"; data: T };

  it("o resumo conta só leads de instaladores, sem dinheiro de cobrança nem estoque", async () => {
    const { sections } = await run(["summary"]);
    const data = (sections.summary as Ok<{ metrics: { id: string; value: unknown }[]; breakdowns: { leadsBySegment: { label: string }[] } }>).data;
    const ids = data.metrics.map((m) => m.id);
    expect(data.metrics.find((m) => m.id === "total_leads")?.value).toBe(1);
    expect(data.metrics.find((m) => m.id === "agent_conversations")?.value).toBe(1);
    expect(ids).not.toContain("received_revenue");
    expect(ids).not.toContain("open_collections");
    expect(ids).not.toContain("produtos_disponiveis");
    expect(data.breakdowns.leadsBySegment).toHaveLength(1);
  });

  it("agentes: só o do segmento", async () => {
    const { sections } = await run(["agents"]);
    const agents = (sections.agents as Ok<{ agents: { name: string }[] }>).data.agents;
    expect(agents.map((a) => a.name)).toEqual(["Thiago"]);
  });

  it("pendências sem a fila de cobrança; follow-up atrasado só do segmento", async () => {
    const { sections } = await run(["pending"]);
    const items = (sections.pending as Ok<{ items: { id: string; count: number }[] }>).data.items;
    expect(items.map((i) => i.id)).not.toContain("collections_due_today");
    expect(items.find((i) => i.id === "late_followups")?.count).toBe(1);
  });

  it("atividade não mostra cobrança nem lead de outro segmento", async () => {
    const { sections } = await run(["activity"]);
    const labels = (sections.activity as Ok<{ label: string }[]>).data.map((a) => a.label);
    expect(labels).toContain("Instalador Zé");
    expect(labels).not.toContain("Consumidor Ana");
    expect(labels).not.toContain("Devedor");
  });

  it("estoque continua proibido e nem carrega", async () => {
    const l = loaders({ core: vi.fn(async () => mixed) });
    const { sections } = await buildDashboardSnapshot(ctx("installer_manager"), ["inventory"], l);
    expect(sections.inventory).toEqual({ status: "forbidden" });
    expect(l.productMetrics).not.toHaveBeenCalled();
  });

  it("papel sem escopo continua vendo tudo", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["agents"], loaders({ core: vi.fn(async () => mixed) }));
    expect((sections.agents as Ok<{ agents: unknown[] }>).data.agents).toHaveLength(2);
  });
});

describe("pendências", () => {
  it("não inclui mais as planilhas de prospecção (sheet_sources, outro sistema)", async () => {
    const { sections } = await buildDashboardSnapshot(ctx("owner"), ["pending"], loaders());
    const ids = (sections.pending as { status: "ok"; data: { items: { id: string }[] } }).data.items.map((i) => i.id);
    expect(ids).not.toContain("stale_integrations");
  });
});
