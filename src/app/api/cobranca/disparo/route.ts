import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiPermission } from "@/lib/server/api-auth";

type DisparoLead = Record<string, string>;

/** Linha que o CRM recusou antes de despachar — ver normalizarTelefone(). */
type LinhaRecusada = {
  nome: string;
  telefone: string;
  documento: string;
  valor: string;
  motivo: "vazio" | "fixo" | "invalido";
};

const MOTIVO_TEXTO: Record<LinhaRecusada["motivo"], string> = {
  fixo: "Telefone fixo — não existe no WhatsApp",
  vazio: "Sem telefone na planilha",
  invalido: "Número em formato inválido",
};

/**
 * Grava quem não pôde ser disparado como NAO DISPARADO na própria cobranca_log.
 *
 * O aviso no preview do upload some assim que a tela troca, e aí ninguém mais
 * sabe que aqueles boletos ficaram de fora. Na tabela eles entram no filtro
 * "NAO DISPARADO", no CSV e no PDF que já existem, e quem subiu a planilha tem
 * onde ir atrás do número certo.
 */
async function gravarRecusados(
  admin: ReturnType<typeof createAdminClient>,
  recusados: LinhaRecusada[]
): Promise<number> {
  if (!recusados.length) return 0;

  // Um cliente pode ter vários boletos recusados: vira uma linha só, somada,
  // que é como a tabela trata todo o resto.
  const porCliente = new Map<string, LinhaRecusada[]>();
  for (const r of recusados) {
    const chave = r.telefone || r.nome || "sem-identificacao";
    if (!porCliente.has(chave)) porCliente.set(chave, []);
    porCliente.get(chave)!.push(r);
  }

  const agora = new Date().toISOString();
  const linhas = [...porCliente.values()].map((grupo) => {
    const total = grupo.reduce((s, r) => {
      const n = Number(String(r.valor).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    return {
      telefone: grupo[0].telefone || "",
      nome: grupo[0].nome || null,
      valor: total > 0 ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null,
      documento: grupo.map((r) => r.documento).filter(Boolean).join(" | ") || null,
      boleto_count: grupo.length,
      status_disparo: "NAO DISPARADO",
      created_at: agora,
      data_disparo: agora,
      metadata: {
        motivo_nao_disparo: grupo[0].motivo,
        motivo_texto: MOTIVO_TEXTO[grupo[0].motivo],
        telefone_planilha: grupo[0].telefone,
      },
    };
  });

  try {
    await admin.from("cobranca_log").insert(linhas);
    return linhas.length;
  } catch (err) {
    console.error("[DISPARO] Falha ao gravar os recusados:", err);
    return 0;
  }
}

const PYTHON_COBRANCA_URL = (process.env.PYTHON_COBRANCA_URL || "https://arcil-arcil-cobranca-py.47nukb.easypanel.host/cobranca").trim().replace(/^﻿/, "");

const MAX_LEADS_PER_DISPARO = 1000;
const PHONE_RE = /^55\d{10,11}$/;

type LandedRow = { id: string; telefone: string | null; valor: string | null; metadata: Record<string, unknown> | null };

// O serviço de cobrança responde 200 e só depois faz o INSERT. Repete a consulta
// até todos os telefones aparecerem — ou até o teto, e aí quem faltou faltou
// mesmo (o Python descarta lead em silêncio, foi por isso que a conferência
// nasceu).
const CONFIRM_TIMEOUT_MS = 8_000;
const CONFIRM_INTERVAL_MS = 400;

async function waitForRows(
  admin: ReturnType<typeof createAdminClient>,
  phones: string[],
  cutoff: string
): Promise<LandedRow[]> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let rows: LandedRow[] = [];
  for (;;) {
    try {
      const { data } = await admin
        .from("cobranca_log")
        .select("id, telefone, valor, metadata")
        .in("telefone", phones)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });
      rows = (data ?? []) as LandedRow[];
      const found = new Set(rows.map((r) => r.telefone));
      if (phones.every((p) => found.has(p))) return rows;
    } catch (err) {
      console.error("[DISPARO] Falha ao conferir linhas gravadas:", err);
    }
    if (Date.now() >= deadline) return rows;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
  }
}

function validateLeads(leads: DisparoLead[]): string | null {
  if (leads.length > MAX_LEADS_PER_DISPARO) {
    return `Máximo de ${MAX_LEADS_PER_DISPARO} leads por disparo (recebido: ${leads.length})`;
  }
  for (const lead of leads) {
    const numero = lead["numero"];
    if (!numero || !PHONE_RE.test(numero)) {
      return `Telefone inválido: "${numero ?? ""}" — esperado DDI 55 + DDD + número (10-11 dígitos)`;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiPermission("manage_cobranca");
  if (response) return response;

  const { leads, recusados = [] }: { leads: DisparoLead[]; recusados?: LinhaRecusada[] } = await req.json();
  if (!leads?.length) return Response.json({ error: "Nenhum lead fornecido" }, { status: 400 });

  const validationError = validateLeads(leads);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();

  // Build phone → boletos_json map before dispatch
  const boletosByPhone: Record<string, string> = {};
  // O valor que o CRM calculou a partir da planilha, por telefone. O serviço de
  // cobrança grava esse campo com o valor multiplicado por 10 — uma cobrança de
  // R$ 471,50 virou R$ 4.715,00 no cobranca_log — e o serviço é um deploy
  // separado, fora deste repositório. Enquanto ele não for corrigido, o CRM
  // reescreve o campo com o número que ele mesmo somou da planilha.
  const valorByPhone: Record<string, string> = {};
  for (const lead of leads) {
    const phone = lead["numero"];
    if (!phone) continue;
    if (lead["boletos_json"]) boletosByPhone[phone] = lead["boletos_json"];
    const numerico = Number(lead["valor_numerico"]);
    if (Number.isFinite(numerico) && numerico > 0) {
      valorByPhone[phone] = numerico.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    }
  }

  let pythonStatus: string;
  try {
    const r = await fetch(PYTHON_COBRANCA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads }),
    });
    pythonStatus = `ok:${r.status}`;
    if (!r.ok) {
      console.error("[DISPARO] Python respondeu erro:", r.status);
      return Response.json(
        { ok: false, error: `Serviço de cobrança respondeu ${r.status} — disparo não confirmado`, pythonStatus },
        { status: 502 }
      );
    }
  } catch (err) {
    pythonStatus = `erro:${String(err)}`;
    console.error("[DISPARO] Falha ao chamar Python:", err);
    return Response.json(
      { ok: false, error: "Falha ao contatar o serviço de cobrança — nada foi disparado", pythonStatus },
      { status: 502 }
    );
  }

  // O Python responde 200 ANTES de gravar: num disparo medido, ele respondeu às
  // 19:20:15.800 e as três linhas só chegaram às 19:20:16.10. Uma consulta única
  // logo após o fetch pega a tabela vazia — foi o que fez o CRM anunciar "3 não
  // entraram" e pular a correção de valor. Espera as linhas aparecerem.
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const allPhones = [...new Set(leads.map((l) => l["numero"]).filter(Boolean))];
  const landedRows = await waitForRows(admin, allPhones, cutoff);
  const confirmedPhones = [...new Set(landedRows.map((r) => r.telefone).filter(Boolean) as string[])];
  const missingPhones = allPhones.filter((p) => !confirmedPhones.includes(p));

  // Sobre as linhas já confirmadas, o CRM corrige o que ele sabe melhor: o valor
  // somado da planilha (o Python grava multiplicado por 10) e o detalhamento dos
  // boletos, que o agente lê depois para conversar.
  let valoresCorrigidos = 0;
  try {
    // Uma linha por telefone — landedRows vem em ordem decrescente de created_at.
    const byPhone = new Map<string, LandedRow>();
    for (const row of landedRows) {
      if (row.telefone && !byPhone.has(row.telefone)) byPhone.set(row.telefone, row);
    }

    await Promise.all(
      [...byPhone.entries()].map(([phone, row]) => {
        const patch: Record<string, unknown> = {};
        if (boletosByPhone[phone]) {
          // Merge: preserva a metadata gravada pelo ERP/Python (update substituiria a coluna inteira)
          patch.metadata = { ...(row.metadata ?? {}), boletos_json: boletosByPhone[phone] };
        }
        if (valorByPhone[phone] && row.valor !== valorByPhone[phone]) {
          patch.valor = valorByPhone[phone];
          valoresCorrigidos += 1;
        }
        if (Object.keys(patch).length === 0) return Promise.resolve();
        return admin.from("cobranca_log").update(patch).eq("id", row.id);
      })
    );
  } catch (err) {
    console.error("[DISPARO] Falha ao corrigir valor/boletos na cobranca_log:", err);
  }

  // Só depois do Python aceitar: se o disparo falhou, quem subiu vai tentar de
  // novo, e gravar antes deixaria os recusados duplicados na tabela.
  const recusadosGravados = await gravarRecusados(admin, recusados);

  await admin.from("activity_log").insert({
    entity_type: "cobranca_disparo",
    entity_id: crypto.randomUUID(),
    action: "disparo",
    metadata: {
      count: leads.length,
      confirmed: confirmedPhones.length,
      missing: missingPhones,
      recusados: recusadosGravados,
      valoresCorrigidos,
      pythonStatus,
      actor_id: user!.id,
    },
    wf_origin: "crm",
  });

  return Response.json({
    ok: true,
    recusados: recusadosGravados,
    // `inserted` passa a ser o que existe na tabela, não o que foi enviado.
    // Ambos contam CLIENTES: `leads` agora chega com uma linha por boleto, e um
    // cliente com três boletos continua sendo um disparo só.
    inserted: confirmedPhones.length,
    sent: allPhones.length,
    missing: missingPhones,
    pythonStatus,
  });
}
