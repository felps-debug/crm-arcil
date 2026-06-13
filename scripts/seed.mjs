#!/usr/bin/env node
/**
 * ARCIL Analytics — Seed de dados realistas no Supabase
 * Uso: node scripts/seed.mjs
 */

const SUPABASE_URL = "https://swcqvrowqwylcegrcesu.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3Y3F2cm93cXd5bGNlZ3JjZXN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg0MDcyMSwiZXhwIjoyMDg5NDE2NzIxfQ.SSx5qoQzflm7n891dIwEqxzNZ9FVYGnl6LxUNdke-MU";

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function clearTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`  ⚠ clear ${table}: ${err}`);
  }
}

async function insert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[${table}] ${res.status}: ${err}`);
  }
  const data = await res.json();
  console.log(`  ✓ ${table}: ${data.length} rows`);
  return data;
}

function uuid() {
  return crypto.randomUUID();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

// ══════════════════════════════════════════════════════════════════
// IDs pré-definidos para referência cruzada
// ══════════════════════════════════════════════════════════════════

const vendorIds = Array.from({ length: 6 }, () => uuid());
const leadIds = Array.from({ length: 25 }, () => uuid());
const productIds = Array.from({ length: 8 }, () => uuid());
const conversationIds = Array.from({ length: 15 }, () => uuid());
const quoteIds = Array.from({ length: 10 }, () => uuid());
const saleIds = Array.from({ length: 6 }, () => uuid());
const billingIds = Array.from({ length: 8 }, () => uuid());

// ══════════════════════════════════════════════════════════════════
// 1. VENDORS (6 vendedores)
// ══════════════════════════════════════════════════════════════════

const vendors = [
  { id: vendorIds[0], name: "Carlos Mendes", segment: ["CONSUMER", "NEW"], chatwoot_agent_id: "agent_01", wa_phone: "5544999001001", active: true },
  { id: vendorIds[1], name: "Fernanda Oliveira", segment: ["BUILDER", "ARCHITECT"], chatwoot_agent_id: "agent_02", wa_phone: "5544999002002", active: true },
  { id: vendorIds[2], name: "Ricardo Santos", segment: ["INSTALLER", "RESELLER"], chatwoot_agent_id: "agent_03", wa_phone: "5544999003003", active: true },
  { id: vendorIds[3], name: "Ana Paula Costa", segment: ["CONSUMER"], chatwoot_agent_id: "agent_04", wa_phone: "5543999004004", active: true },
  { id: vendorIds[4], name: "Marcos Vieira", segment: ["BUILDER", "INSTALLER"], chatwoot_agent_id: "agent_05", wa_phone: "5543999005005", active: true },
  { id: vendorIds[5], name: "Juliana Ferreira", segment: ["RESELLER", "ARCHITECT"], chatwoot_agent_id: "agent_06", wa_phone: "5567999006006", active: false },
];

// ══════════════════════════════════════════════════════════════════
// 2. LEADS (25 leads)
// ══════════════════════════════════════════════════════════════════

const leadData = [
  // CONSUMER (6)
  { name: "João Pereira", company: "Residencial", region: "Maringá", segment: "CONSUMER", status: "ganho", channel: "whatsapp", score: 85 },
  { name: "Maria Silva", company: null, region: "Maringá", segment: "CONSUMER", status: "em_negociacao", channel: "instagram", score: 72 },
  { name: "Pedro Almeida", company: null, region: "Londrina", segment: "CONSUMER", status: "proposta_enviada", channel: "site", score: 68 },
  { name: "Lucia Martins", company: null, region: "Londrina", segment: "CONSUMER", status: "qualificado", channel: "whatsapp", score: 55 },
  { name: "André Souza", company: null, region: "Maringá", segment: "CONSUMER", status: "ganho", channel: "indicacao", score: 90 },
  { name: "Camila Rocha", company: null, region: "Bataguassu", segment: "CONSUMER", status: "perdido", channel: "instagram", score: 30 },
  // BUILDER (5)
  { name: "Roberto Lima", company: "Construtora Horizonte", region: "Maringá", segment: "BUILDER", status: "ganho", channel: "campanha_b2b", score: 92 },
  { name: "Marcos Duarte", company: "MRD Construções", region: "Londrina", segment: "BUILDER", status: "em_negociacao", channel: "whatsapp", score: 78 },
  { name: "Thiago Nunes", company: "Nunes Engenharia", region: "Maringá", segment: "BUILDER", status: "proposta_enviada", channel: "site", score: 65 },
  { name: "Felipe Cardoso", company: "FC Empreendimentos", region: "Bataguassu", segment: "BUILDER", status: "novo", channel: "campanha_b2b", score: 40 },
  { name: "Gustavo Prado", company: "Prado Construtora", region: "Londrina", segment: "BUILDER", status: "perdido", channel: "whatsapp", score: 25 },
  // ARCHITECT (4)
  { name: "Isabela Moreira", company: "Studio Moreira Arq", region: "Maringá", segment: "ARCHITECT", status: "ganho", channel: "indicacao", score: 88 },
  { name: "Daniela Ramos", company: "DR Arquitetura", region: "Londrina", segment: "ARCHITECT", status: "qualificado", channel: "instagram", score: 62 },
  { name: "Bruno Teixeira", company: "BT Projetos", region: "Maringá", segment: "ARCHITECT", status: "em_negociacao", channel: "site", score: 70 },
  { name: "Renata Campos", company: "Campos & Assoc.", region: "Bataguassu", segment: "ARCHITECT", status: "novo", channel: "campanha_b2b", score: 35 },
  // INSTALLER (5)
  { name: "Leandro Azevedo", company: "Azevedo Climatização", region: "Maringá", segment: "INSTALLER", status: "ganho", channel: "whatsapp", score: 95 },
  { name: "Paulo Henrique", company: "PH Refrigeração", region: "Londrina", segment: "INSTALLER", status: "proposta_enviada", channel: "indicacao", score: 80 },
  { name: "Sérgio Barbosa", company: "SB Instalações", region: "Maringá", segment: "INSTALLER", status: "em_negociacao", channel: "whatsapp", score: 73 },
  { name: "Diego Fonseca", company: "DF Clima", region: "Bataguassu", segment: "INSTALLER", status: "qualificado", channel: "site", score: 58 },
  { name: "Adriano Costa", company: "Costa Ar", region: "Londrina", segment: "INSTALLER", status: "perdido", channel: "campanha_b2b", score: 20 },
  // RESELLER (3)
  { name: "Cristina Lopes", company: "CL Distribuidora", region: "Maringá", segment: "RESELLER", status: "ganho", channel: "campanha_b2b", score: 93 },
  { name: "Fábio Nascimento", company: "FN Revenda", region: "Londrina", segment: "RESELLER", status: "em_negociacao", channel: "whatsapp", score: 75 },
  { name: "Tatiane Dias", company: "TD Comércio", region: "Bataguassu", segment: "RESELLER", status: "novo", channel: "site", score: 42 },
  // NEW (2)
  { name: "Vinícius Alves", company: null, region: "Maringá", segment: "NEW", status: "novo", channel: "whatsapp", score: 10 },
  { name: "Patrícia Ferraz", company: "Ferraz & Cia", region: "Londrina", segment: "NEW", status: "novo", channel: "instagram", score: 15 },
];

const leads = leadData.map((l, i) => ({
  id: leadIds[i],
  wa_phone: `5544${String(900000000 + i)}`,
  name: l.name,
  company: l.company,
  region: l.region,
  channel_origin: l.channel,
  segment: l.segment,
  status: l.status,
  lead_score: l.score,
  chatwoot_contact_id: `ctc_${String(i + 1).padStart(3, "0")}`,
  is_recurring_defaulter: i === 5,
  created_at: monthsAgo(Math.floor(Math.random() * 5) + 1),
  updated_at: daysAgo(Math.floor(Math.random() * 60)),
}));

// ══════════════════════════════════════════════════════════════════
// 3. PRODUCTS CACHE (8 produtos)
// ══════════════════════════════════════════════════════════════════

const products = [
  { id: productIds[0], erp_id: "ERP001", name: "Hi-Wall 9000 BTU Inverter", category: "Split", price: 2199.90, stock_qty: 45 },
  { id: productIds[1], erp_id: "ERP002", name: "Hi-Wall 12000 BTU Inverter", category: "Split", price: 2899.90, stock_qty: 32 },
  { id: productIds[2], erp_id: "ERP003", name: "Multi-Split 2x 9000 BTU", category: "Multi-Split", price: 5499.90, stock_qty: 0 },
  { id: productIds[3], erp_id: "ERP004", name: "Multi-Split 3x 12000 BTU", category: "Multi-Split", price: 8999.90, stock_qty: 0 },
  { id: productIds[4], erp_id: "ERP005", name: "Cassete 24000 BTU", category: "Cassete", price: 7499.90, stock_qty: 8 },
  { id: productIds[5], erp_id: "ERP006", name: "Cassete 36000 BTU", category: "Cassete", price: 9899.90, stock_qty: 3 },
  { id: productIds[6], erp_id: "ERP007", name: "Piso/Teto 48000 BTU", category: "Piso/Teto", price: 12999.90, stock_qty: 0 },
  { id: productIds[7], erp_id: "ERP008", name: "Piso/Teto 60000 BTU", category: "Piso/Teto", price: 15999.90, stock_qty: 5 },
].map(p => ({ ...p, specs: { tipo: p.category, capacidade: p.name.match(/\d+ BTU/)?.[0] }, synced_at: daysAgo(1) }));

// ══════════════════════════════════════════════════════════════════
// 4. CONVERSATIONS (15)
// ══════════════════════════════════════════════════════════════════

const intents = ["compra_residencial", "orcamento_obra", "revenda_atacado", "instalacao", "suporte_tecnico", "projeto_arquitetonico"];
const conversations = Array.from({ length: 15 }, (_, i) => ({
  id: conversationIds[i],
  lead_id: leadIds[i % 25],
  session_id: `sess_${uuid().slice(0, 8)}`,
  channel: ["whatsapp", "instagram", "site"][i % 3],
  intent: intents[i % intents.length],
  summary: [
    "Cliente interessado em climatização residencial",
    "Solicitou orçamento para obra comercial",
    "Pedido de cotação para revenda",
    "Dúvida sobre instalação de cassete",
    "Suporte técnico sobre inverter",
    "Projeto de climatização para escritório",
    "Interesse em multi-split para apartamento",
    "Consulta sobre piso/teto industrial",
    "Negociação de preço para construtora",
    "Follow-up sobre proposta enviada",
    "Cliente retornou após 30 dias",
    "Pedido urgente para entrega rápida",
    "Comparação entre modelos inverter",
    "Solicitação de visita técnica",
    "Fechamento de venda Hi-Wall",
  ][i],
  status: i < 10 ? "closed" : "open",
  vendor_id: vendorIds[i % 6],
  chatwoot_conv_id: `conv_${String(i + 1).padStart(3, "0")}`,
  started_at: daysAgo(Math.floor(Math.random() * 90) + 5),
  ended_at: i < 10 ? daysAgo(Math.floor(Math.random() * 5)) : null,
}));

// ══════════════════════════════════════════════════════════════════
// 5. MESSAGES (30)
// ══════════════════════════════════════════════════════════════════

const messages = [];
for (let i = 0; i < 15; i++) {
  messages.push({
    id: uuid(),
    conversation_id: conversationIds[i],
    role: "user",
    content: [
      "Oi, gostaria de saber o preço do ar-condicionado inverter 12000 BTU",
      "Bom dia! Preciso de um orçamento para 5 unidades de cassete",
      "Vocês têm multi-split disponível? Preciso para meu apartamento",
      "Quanto custa a instalação do piso/teto 48000?",
      "Olá, vi o anúncio no Instagram. Ainda tem o Hi-Wall 9000?",
      "Preciso de climatização para uma obra de 200m²",
      "Quero negociar preço para compra em quantidade",
      "Meu inverter está dando erro E4, podem ajudar?",
      "Gostaria de agendar uma visita técnica",
      "Tem condição especial para arquitetos parceiros?",
      "Preciso de 10 unidades para revenda",
      "O multi-split 3x12000 tem em estoque?",
      "Qual o prazo de entrega para Londrina?",
      "Aceita pagamento parcelado no boleto?",
      "Fechamos! Pode mandar o contrato",
    ][i],
    created_at: conversations[i].started_at,
  });
  messages.push({
    id: uuid(),
    conversation_id: conversationIds[i],
    role: "assistant",
    content: [
      "Olá! O Hi-Wall Inverter 12000 BTU está por R$ 2.899,90. Posso preparar um orçamento personalizado?",
      "Bom dia! Para 5 cassetes, temos condição especial. Vou calcular o melhor preço para você.",
      "Sim, temos o Multi-Split 2x9000 por R$ 5.499,90. No momento está em reposição, previsão de 5 dias.",
      "A instalação do Piso/Teto 48000 fica em torno de R$ 1.800. Inclui material e mão de obra.",
      "Sim, ainda temos! O Hi-Wall 9000 Inverter está por R$ 2.199,90 com entrega em 3 dias.",
      "Para 200m², recomendo 3 cassetes de 36000 BTU. Vou preparar o projeto completo.",
      "Para compras acima de 5 unidades, oferecemos 12% de desconto. Qual modelo te interessa?",
      "O erro E4 indica problema no sensor de temperatura. Recomendo uma visita técnica. Posso agendar?",
      "Claro! Temos disponibilidade para visita na próxima terça ou quinta. Qual prefere?",
      "Sim! Arquitetos parceiros têm 8% de desconto + comissão de 3% sobre vendas indicadas.",
      "Para revenda de 10 unidades, temos tabela B2B com preços diferenciados. Vou enviar por e-mail.",
      "Infelizmente o Multi-Split 3x12000 está sem estoque. Previsão de reposição: 15 dias.",
      "Para Londrina o prazo é de 2-3 dias úteis. Frete grátis para compras acima de R$ 5.000.",
      "Sim, parcelamos em até 6x no boleto sem juros. Posso enviar a proposta?",
      "Perfeito! Vou preparar o contrato e enviar para assinatura digital. Parabéns pela aquisição!",
    ][i],
    created_at: daysAgo(Math.floor(Math.random() * 80)),
  });
}

// ══════════════════════════════════════════════════════════════════
// 6. QUOTES (10)
// ══════════════════════════════════════════════════════════════════

const quotes = [
  { id: quoteIds[0], lead_id: leadIds[0], conversation_id: conversationIds[0], product_id: productIds[1], price_offered: 2699.90, conditions: "À vista com 7% desc", status: "aceito", vendor_id: vendorIds[0] },
  { id: quoteIds[1], lead_id: leadIds[1], conversation_id: conversationIds[1], product_id: productIds[0], price_offered: 2099.90, conditions: "3x sem juros", status: "pendente", vendor_id: vendorIds[0] },
  { id: quoteIds[2], lead_id: leadIds[6], conversation_id: conversationIds[2], product_id: productIds[4], price_offered: 35999.50, conditions: "5 unidades + instalação", status: "aceito", vendor_id: vendorIds[1] },
  { id: quoteIds[3], lead_id: leadIds[7], conversation_id: conversationIds[3], product_id: productIds[2], price_offered: 5199.90, conditions: "Entrega em 10 dias", status: "pendente", vendor_id: vendorIds[1] },
  { id: quoteIds[4], lead_id: leadIds[11], conversation_id: conversationIds[4], product_id: productIds[5], price_offered: 9499.90, conditions: "Projeto completo", status: "aceito", vendor_id: vendorIds[2] },
  { id: quoteIds[5], lead_id: leadIds[15], conversation_id: conversationIds[5], product_id: productIds[6], price_offered: 12499.90, conditions: "Instalação inclusa", status: "aceito", vendor_id: vendorIds[2] },
  { id: quoteIds[6], lead_id: leadIds[20], conversation_id: conversationIds[6], product_id: productIds[3], price_offered: 79999.20, conditions: "10 unidades tabela B2B", status: "aceito", vendor_id: vendorIds[3] },
  { id: quoteIds[7], lead_id: leadIds[2], conversation_id: conversationIds[7], product_id: productIds[7], price_offered: 15499.90, conditions: "6x boleto", status: "pendente", vendor_id: vendorIds[4] },
  { id: quoteIds[8], lead_id: leadIds[8], conversation_id: conversationIds[8], product_id: productIds[2], price_offered: 5299.90, conditions: "Entrega urgente", status: "rejeitado", vendor_id: vendorIds[4] },
  { id: quoteIds[9], lead_id: leadIds[4], conversation_id: conversationIds[9], product_id: productIds[0], price_offered: 2049.90, conditions: "Cliente indicação - desc especial", status: "aceito", vendor_id: vendorIds[5] },
].map(q => ({ ...q, created_at: daysAgo(Math.floor(Math.random() * 60) + 1) }));

// ══════════════════════════════════════════════════════════════════
// 7. SALES (6)
// ══════════════════════════════════════════════════════════════════

const sales = [
  { id: saleIds[0], quote_id: quoteIds[0], lead_id: leadIds[0], vendor_id: vendorIds[0], final_price: 2699.90, payment_conditions: "À vista PIX", erp_order_id: "ORD-2026-001", status: "confirmado", confirmed_at: daysAgo(45) },
  { id: saleIds[1], quote_id: quoteIds[2], lead_id: leadIds[6], vendor_id: vendorIds[1], final_price: 35999.50, payment_conditions: "30/60/90 boleto", erp_order_id: "ORD-2026-002", status: "confirmado", confirmed_at: daysAgo(30) },
  { id: saleIds[2], quote_id: quoteIds[4], lead_id: leadIds[11], vendor_id: vendorIds[2], final_price: 9499.90, payment_conditions: "2x cartão", erp_order_id: "ORD-2026-003", status: "confirmado", confirmed_at: daysAgo(20) },
  { id: saleIds[3], quote_id: quoteIds[5], lead_id: leadIds[15], vendor_id: vendorIds[2], final_price: 12499.90, payment_conditions: "À vista boleto", erp_order_id: "ORD-2026-004", status: "confirmado", confirmed_at: daysAgo(15) },
  { id: saleIds[4], quote_id: quoteIds[6], lead_id: leadIds[20], vendor_id: vendorIds[3], final_price: 79999.20, payment_conditions: "Faturado 30 dias", erp_order_id: "ORD-2026-005", status: "confirmado", confirmed_at: daysAgo(10) },
  { id: saleIds[5], quote_id: quoteIds[9], lead_id: leadIds[4], vendor_id: vendorIds[5], final_price: 2049.90, payment_conditions: "PIX", erp_order_id: "ORD-2026-006", status: "confirmado", confirmed_at: daysAgo(5) },
];

// ══════════════════════════════════════════════════════════════════
// 8. FOLLOWUPS (12)
// ══════════════════════════════════════════════════════════════════

const followups = [
  { lead_id: leadIds[1], nome_cliente: "Maria Silva", numero_cliente: "5544900000001", produto_negociado: "Hi-Wall 9000 BTU", preco_ofertado: 2099.90, motivo_nao_converteu: "Comparando preços", followup_step: 1, respondeu: true, status: "realizado" },
  { lead_id: leadIds[1], nome_cliente: "Maria Silva", numero_cliente: "5544900000001", produto_negociado: "Hi-Wall 9000 BTU", preco_ofertado: 2099.90, motivo_nao_converteu: "Ainda comparando", followup_step: 2, respondeu: true, status: "realizado" },
  { lead_id: leadIds[1], nome_cliente: "Maria Silva", numero_cliente: "5544900000001", produto_negociado: "Hi-Wall 9000 BTU", preco_ofertado: 2099.90, motivo_nao_converteu: "Pediu mais prazo", followup_step: 3, respondeu: false, status: "pendente" },
  { lead_id: leadIds[2], nome_cliente: "Pedro Almeida", numero_cliente: "5544900000002", produto_negociado: "Piso/Teto 60000 BTU", preco_ofertado: 15499.90, motivo_nao_converteu: "Aguardando aprovação", followup_step: 1, respondeu: true, status: "realizado" },
  { lead_id: leadIds[2], nome_cliente: "Pedro Almeida", numero_cliente: "5544900000002", produto_negociado: "Piso/Teto 60000 BTU", preco_ofertado: 15499.90, motivo_nao_converteu: "Aprovação pendente", followup_step: 2, respondeu: false, status: "pendente" },
  { lead_id: leadIds[7], nome_cliente: "Marcos Duarte", numero_cliente: "5544900000007", produto_negociado: "Multi-Split 2x9000", preco_ofertado: 5199.90, motivo_nao_converteu: "Sem estoque", followup_step: 1, respondeu: true, status: "realizado" },
  { lead_id: leadIds[7], nome_cliente: "Marcos Duarte", numero_cliente: "5544900000007", produto_negociado: "Multi-Split 2x9000", preco_ofertado: 5199.90, motivo_nao_converteu: "Aguardando reposição", followup_step: 2, respondeu: true, status: "realizado" },
  { lead_id: leadIds[7], nome_cliente: "Marcos Duarte", numero_cliente: "5544900000007", produto_negociado: "Multi-Split 2x9000", preco_ofertado: 5199.90, motivo_nao_converteu: "Reposição atrasada", followup_step: 3, respondeu: true, status: "realizado" },
  { lead_id: leadIds[7], nome_cliente: "Marcos Duarte", numero_cliente: "5544900000007", produto_negociado: "Multi-Split 2x9000", preco_ofertado: 5199.90, motivo_nao_converteu: "Insistindo no prazo", followup_step: 4, respondeu: false, status: "pendente" },
  { lead_id: leadIds[13], nome_cliente: "Bruno Teixeira", numero_cliente: "5544900000013", produto_negociado: "Cassete 36000 BTU", preco_ofertado: 9499.90, motivo_nao_converteu: "Projeto em revisão", followup_step: 1, respondeu: true, status: "realizado" },
  { lead_id: leadIds[16], nome_cliente: "Paulo Henrique", numero_cliente: "5544900000016", produto_negociado: "Cassete 24000 BTU", preco_ofertado: 7199.90, motivo_nao_converteu: "Cliente viajando", followup_step: 1, respondeu: false, status: "pendente" },
  { lead_id: leadIds[21], nome_cliente: "Fábio Nascimento", numero_cliente: "5544900000021", produto_negociado: "Multi-Split 3x12000", preco_ofertado: 8499.90, motivo_nao_converteu: "Negociando desconto", followup_step: 5, respondeu: false, status: "pendente" },
].map((f, i) => ({ id: i + 1, ...f, quote_id: quoteIds[i % 10], created_at: daysAgo(Math.floor(Math.random() * 30) + 1) }));

// ══════════════════════════════════════════════════════════════════
// 9. BILLING (8)
// ══════════════════════════════════════════════════════════════════

const billing = [
  { id: billingIds[0], sale_id: saleIds[0], lead_id: leadIds[0], due_date: daysAgo(-5), amount: 2699.90, payment_status: "pago", reminder_stage: "none", paid_at: daysAgo(46) },
  { id: billingIds[1], sale_id: saleIds[1], lead_id: leadIds[6], due_date: daysAgo(-2), amount: 11999.83, payment_status: "pago", reminder_stage: "none", paid_at: daysAgo(28) },
  { id: billingIds[2], sale_id: saleIds[1], lead_id: leadIds[6], due_date: daysAgo(5), amount: 11999.83, payment_status: "pago", reminder_stage: "D0", paid_at: daysAgo(5) },
  { id: billingIds[3], sale_id: saleIds[1], lead_id: leadIds[6], due_date: daysAgo(-30), amount: 11999.84, payment_status: "pendente", reminder_stage: "D-3", paid_at: null },
  { id: billingIds[4], sale_id: saleIds[2], lead_id: leadIds[11], due_date: daysAgo(3), amount: 4749.95, payment_status: "pago", reminder_stage: "none", paid_at: daysAgo(18) },
  { id: billingIds[5], sale_id: saleIds[2], lead_id: leadIds[11], due_date: daysAgo(-10), amount: 4749.95, payment_status: "atrasado", reminder_stage: "D+7", paid_at: null },
  { id: billingIds[6], sale_id: saleIds[3], lead_id: leadIds[15], due_date: daysAgo(-5), amount: 12499.90, payment_status: "pendente", reminder_stage: "D-3", paid_at: null },
  { id: billingIds[7], sale_id: saleIds[4], lead_id: leadIds[20], due_date: daysAgo(2), amount: 79999.20, payment_status: "pago", reminder_stage: "none", paid_at: daysAgo(8) },
].map(b => ({ ...b, boleto_url: `https://boleto.arcil.com.br/${b.id.slice(0, 8)}` }));

// ══════════════════════════════════════════════════════════════════
// 10. COLLECTION EVENTS (10)
// ══════════════════════════════════════════════════════════════════

const collectionEvents = [
  { billing_id: billingIds[3], stage: "D-3", message_sent: "Lembrete: seu boleto vence em 3 dias", response: "Ok, vou pagar" },
  { billing_id: billingIds[3], stage: "D0", message_sent: "Seu boleto vence hoje!", response: null },
  { billing_id: billingIds[3], stage: "D+1", message_sent: "Boleto vencido ontem. Regularize.", response: "Vou verificar" },
  { billing_id: billingIds[5], stage: "D-3", message_sent: "Lembrete de vencimento", response: null },
  { billing_id: billingIds[5], stage: "D0", message_sent: "Boleto vence hoje", response: null },
  { billing_id: billingIds[5], stage: "D+1", message_sent: "Boleto vencido", response: "Tive um imprevisto" },
  { billing_id: billingIds[5], stage: "D+3", message_sent: "3 dias de atraso. Regularize para evitar juros.", response: null },
  { billing_id: billingIds[5], stage: "D+7", message_sent: "7 dias de atraso. Última chamada antes de protesto.", response: "Vou pagar amanhã" },
  { billing_id: billingIds[6], stage: "D-3", message_sent: "Seu boleto vence em 3 dias", response: "Recebido, obrigado" },
  { billing_id: billingIds[6], stage: "D0", message_sent: "Boleto vence hoje!", response: null },
].map(e => ({ id: uuid(), ...e, sent_at: daysAgo(Math.floor(Math.random() * 15)) }));

// ══════════════════════════════════════════════════════════════════
// 11. CAMPAIGN BASE (5)
// ══════════════════════════════════════════════════════════════════

const campaignBase = [
  { id: uuid(), lead_id: leadIds[5], tags: "{perdido,consumidor,reengajar}", reason: "Lead perdido - tentar reengajamento com oferta especial", last_contact_at: daysAgo(45) },
  { id: uuid(), lead_id: leadIds[10], tags: "{perdido,construtor,b2b}", reason: "Construtor que não fechou - retomar com nova tabela", last_contact_at: daysAgo(60) },
  { id: uuid(), lead_id: leadIds[19], tags: "{perdido,instalador,preço}", reason: "Instalador que achou caro - apresentar linha econômica", last_contact_at: daysAgo(35) },
  { id: uuid(), lead_id: leadIds[14], tags: "{novo,arquiteto,sem_retorno}", reason: "Arquiteto sem retorno após primeiro contato", last_contact_at: daysAgo(40) },
  { id: uuid(), lead_id: leadIds[22], tags: "{novo,revenda,potencial}", reason: "Revenda interessada mas sem follow-up ainda", last_contact_at: daysAgo(20) },
].map(c => ({ ...c, added_at: daysAgo(Math.floor(Math.random() * 30) + 5) }));

// ══════════════════════════════════════════════════════════════════
// 12. ACTIVITY LOG (20)
// ══════════════════════════════════════════════════════════════════

const actions = [
  "lead_created", "lead_created", "lead_created",
  "quote_sent", "quote_sent",
  "followup_sent", "followup_sent", "followup_sent",
  "email_opened", "email_opened",
  "message_received", "message_received",
  "handoff_to_human", "handoff_to_human",
  "sale_confirmed", "sale_confirmed",
  "status_changed", "status_changed",
  "bot_response", "bot_response",
];

const activityLog = actions.map((action, i) => ({
  id: uuid(),
  entity_type: action.includes("lead") ? "lead" : action.includes("quote") || action.includes("sale") ? "sale" : "conversation",
  entity_id: leadIds[i % 25],
  action,
  metadata: { source: "n8n", workflow: `wf_${action}` },
  wf_origin: ["wf_orquestrador", "wf_followup", "wf_cobranca", "wf_lead_create"][i % 4],
  created_at: daysAgo(Math.floor(Math.random() * 30)),
}));

// ══════════════════════════════════════════════════════════════════
// EXECUTAR SEED
// ══════════════════════════════════════════════════════════════════

async function run() {
  console.log("🌱 Iniciando seed ARCIL Analytics...\n");

  try {
    // Limpar tabelas na ordem inversa (respeitar FKs)
    console.log("  🗑  Limpando tabelas...");
    const tablesToClear = [
      "activity_log", "campaign_base", "collection_events", "billing",
      "followups", "sales", "quotes", "messages", "conversations",
      "leads", "products_cache", "vendors",
    ];
    for (const t of tablesToClear) await clearTable(t);
    console.log("  ✓ Tabelas limpas\n");

    // Inserir na ordem correta (respeitar FKs)
    await insert("vendors", vendors);
    await insert("products_cache", products);
    await insert("leads", leads);
    await insert("conversations", conversations);
    await insert("messages", messages);
    await insert("quotes", quotes);
    await insert("sales", sales);
    await insert("followups", followups);
    await insert("billing", billing);
    await insert("collection_events", collectionEvents);
    await insert("campaign_base", campaignBase);
    await insert("activity_log", activityLog);

    console.log("\n✅ Seed completo! Dados inseridos com sucesso.");
  } catch (err) {
    console.error("\n❌ Erro no seed:", err.message);
    process.exit(1);
  }
}

run();
