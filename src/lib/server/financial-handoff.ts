import { N8N_FINANCIAL_HANDOFF_SECRET, N8N_FINANCIAL_HANDOFF_WEBHOOK } from "@/lib/env";

/**
 * `pago` fecha o boleto. `renegociado` e `juridico` NAO fecham: continuam
 * divida viva na posicao atual, so mudam quem age sobre ela.
 *  - renegociado: cliente prometeu pagar em `promisedAt`; volta a cobranca na data
 *  - juridico: caso com o advogado; regua parada, divida visivel
 */
export type FinancialHandoffDecisionStatus = "pago" | "renegociado" | "juridico";
export type FinancialHandoffDestination = "devolver_ao_bot" | "sem_retorno";

export type FinancialHandoffDecision = {
  empresa: string;
  documento: string;
  status: FinancialHandoffDecisionStatus;
  note: string | null;
  /** Data prometida (YYYY-MM-DD). Obrigatoria em `renegociado`, null nos outros. */
  promisedAt: string | null;
};

export type FinancialHandoffPayload = {
  destination: FinancialHandoffDestination;
  decisions: FinancialHandoffDecision[];
};

export type FinancialBoardColumn = "awaiting_response" | "human" | "awaiting_return" | "juridico" | "resolved";

export type FinancialHandoffBoleto = {
  empresa: string;
  documento: string;
  valor: number;
  vencimento: string | null;
  status: string | null;
  observacao: string | null;
};

export type FinancialBoardItem = {
  leadId: string;
  name: string | null;
  phone: string;
  cobrancaLogId: string | null;
  openBoletoCount: number;
  openAmount: number;
  /** Somatório dos boletos com decisão viva "pago". O valor não vive na tabela
   *  de decisões — vem do snapshot do disparo, cruzado por empresa+documento. */
  paidAmount: number;
  paidBoletoCount: number;
  handoffSentAt: string | null;
  handoffAcceptedAt: string | null;
  handoffStaffOkAt: string | null;
  /** `card` = veio de handoff do agente (o financeiro recebeu aviso no
   *  WhatsApp); `manual` = alguém assumiu direto pelo Chatwoot, sem card.
   *  `null` = ainda não está com humano. */
  origemAtendimento: "card" | "manual" | null;
  column: FinancialBoardColumn;
  followupAt: string | null;
  resolutionId: string | null;
  n8nStatus: "pending" | "delivered" | "failed" | null;
  boletos: FinancialHandoffBoleto[];
  activeDecisions: FinancialHandoffDecision[];
};

export type FinancialBoardResolution = {
  destination: FinancialHandoffDestination;
  recordedAt: string;
  followupStatus: string | null;
};

export function classifyFinancialHandoff(input: {
  handoffAcceptedAt: string | null;
  resolution: FinancialBoardResolution | null;
  openBoletoCount: number;
  /** Decisoes vivas do lead. Sem elas renegociado e juridico caem em
   *  "aguardando resposta" como se ninguem tivesse tratado o caso. */
  activeDecisions?: { status: FinancialHandoffDecisionStatus }[];
}): FinancialBoardColumn {
  // Só o pagamento resolve. Antes qualquer decisão viva zerava a posição e
  // mandava o card pra cá — foi assim que R$ 2.584,33 de dívida viva
  // apareceram como "R$ 0,00 / 0 boletos em aberto".
  if (input.openBoletoCount === 0) return "resolved";

  const decisions = input.activeDecisions ?? [];
  // Jurídico vem antes de tudo: o caso está com o advogado e nem a régua nem
  // o financeiro devem cobrar, mas a dívida continua na conta.
  if (decisions.some((decision) => decision.status === "juridico")) return "juridico";
  if (decisions.some((decision) => decision.status === "renegociado")) return "awaiting_return";

  if (input.resolution?.destination === "sem_retorno" && ["scheduled", "processing"].includes(input.resolution.followupStatus ?? "")) {
    return "awaiting_return";
  }
  if (input.handoffAcceptedAt && (!input.resolution || new Date(input.handoffAcceptedAt).getTime() > new Date(input.resolution.recordedAt).getTime())) {
    return "human";
  }
  return "awaiting_response";
}

export class FinancialHandoffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialHandoffValidationError";
  }
}

export class FinancialHandoffWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialHandoffWebhookError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new FinancialHandoffValidationError(message);
  return value.trim();
}

export function parseFinancialHandoffPayload(value: unknown): FinancialHandoffPayload {
  const input = asRecord(value);
  if (!input) throw new FinancialHandoffValidationError("Dados inválidos");

  const destination = input.destination;
  if (destination !== "devolver_ao_bot" && destination !== "sem_retorno") {
    throw new FinancialHandoffValidationError("Destino inválido");
  }

  if (!Array.isArray(input.decisions)) throw new FinancialHandoffValidationError("Decisões inválidas");

  const decisionKeys = new Set<string>();
  const decisions = input.decisions.map((value) => {
    const decision = asRecord(value);
    if (!decision) throw new FinancialHandoffValidationError("Boleto inválido");

    const empresa = requiredText(decision.empresa, "Boleto inválido");
    const documento = requiredText(decision.documento, "Boleto inválido");
    let status: FinancialHandoffDecisionStatus;
    if (decision.status === "pago") status = "pago";
    else if (decision.status === "renegociado") status = "renegociado";
    else if (decision.status === "juridico") status = "juridico";
    else throw new FinancialHandoffValidationError("Status do boleto inválido");

    const note = typeof decision.note === "string" && decision.note.trim() ? decision.note.trim() : null;
    // Boleto que para de ser cobrado sem explicação vira mistério daqui a um
    // mês. Vale para renegociado e para jurídico.
    if (status !== "pago" && !note) {
      throw new FinancialHandoffValidationError(
        status === "renegociado" ? "Informe a observação da renegociação" : "Informe a observação do caso jurídico",
      );
    }

    // A data é o que traz a cobrança de volta sozinha. Sem ela o caso some da
    // mesa e só sobra um bilhete pedindo para alguém não esquecer.
    const promisedRaw = typeof decision.promisedAt === "string" ? decision.promisedAt.trim() : "";
    let promisedAt: string | null = null;
    if (status === "renegociado") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(promisedRaw)) {
        throw new FinancialHandoffValidationError("Informe a data prometida da renegociação");
      }
      const hoje = new Date().toISOString().slice(0, 10);
      if (promisedRaw < hoje) {
        throw new FinancialHandoffValidationError("A data prometida não pode estar no passado");
      }
      promisedAt = promisedRaw;
    }

    const key = `${empresa}\u0000${documento}`;
    if (decisionKeys.has(key)) throw new FinancialHandoffValidationError("Boleto informado mais de uma vez");
    decisionKeys.add(key);

    return { empresa, documento, status, note, promisedAt };
  });

  return { destination, decisions };
}

export function normalizeFinancialHandoffPhone(phone: string) {
  const normalized = phone.replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(normalized)) {
    throw new FinancialHandoffWebhookError("Telefone do lead inválido para devolução ao bot");
  }
  return normalized;
}

export async function notifyFinancialHandoffN8n(input: {
  resolutionId: string;
  leadId: string;
  phone: string;
  destination: FinancialHandoffDestination;
  /** ISO de quando o bot pode voltar. Null em `devolver_ao_bot`, onde ele volta
   *  na hora. */
  followupAt?: string | null;
}) {
  if (!N8N_FINANCIAL_HANDOFF_WEBHOOK || !N8N_FINANCIAL_HANDOFF_SECRET) {
    throw new FinancialHandoffWebhookError("Integração de handoff financeiro não configurada");
  }

  const response = await fetch(N8N_FINANCIAL_HANDOFF_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-financial-handoff-secret": N8N_FINANCIAL_HANDOFF_SECRET,
    },
    body: JSON.stringify({
      resolutionId: input.resolutionId,
      leadId: input.leadId,
      phone: normalizeFinancialHandoffPhone(input.phone),
      destination: input.destination,
      botName: "cobranca",
      followupAt: input.followupAt ?? null,
      // Segundos que o bloqueio do bot ainda deve durar. Vai calculado daqui
      // porque a data de retomada é decidida no banco, junto da resolução — o
      // n8n só aplica. Piso de uma hora para uma data já vencida não virar TTL
      // zero (que o Redis trata como "sem expiração").
      blockSeconds: input.followupAt
        ? Math.max(3600, Math.round((new Date(input.followupAt).getTime() - Date.now()) / 1000))
        : null,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new FinancialHandoffWebhookError(`Workflow financeiro respondeu ${response.status}`);
  }

  const body = await response.json().catch(() => null) as { ok?: unknown; resolutionId?: unknown } | null;
  if (!body || body.ok !== true || body.resolutionId !== input.resolutionId) {
    throw new FinancialHandoffWebhookError("Workflow financeiro retornou uma confirmação inválida");
  }
}
