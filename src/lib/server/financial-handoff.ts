import { N8N_FINANCIAL_HANDOFF_SECRET, N8N_FINANCIAL_HANDOFF_WEBHOOK } from "@/lib/env";

export type FinancialHandoffDecisionStatus = "pago" | "renegociado";
export type FinancialHandoffDestination = "devolver_ao_bot" | "sem_retorno";

export type FinancialHandoffDecision = {
  empresa: string;
  documento: string;
  status: FinancialHandoffDecisionStatus;
  note: string | null;
};

export type FinancialHandoffPayload = {
  destination: FinancialHandoffDestination;
  decisions: FinancialHandoffDecision[];
};

export type FinancialBoardColumn = "awaiting_response" | "human" | "awaiting_return" | "resolved";

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
  handoffAcceptedAt: string | null;
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
}): FinancialBoardColumn {
  if (input.openBoletoCount === 0) return "resolved";
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
    else throw new FinancialHandoffValidationError("Status do boleto inválido");

    const note = typeof decision.note === "string" && decision.note.trim() ? decision.note.trim() : null;
    if (status === "renegociado" && !note) {
      throw new FinancialHandoffValidationError("Informe a observação da renegociação");
    }

    const key = `${empresa}\u0000${documento}`;
    if (decisionKeys.has(key)) throw new FinancialHandoffValidationError("Boleto informado mais de uma vez");
    decisionKeys.add(key);

    return { empresa, documento, status, note };
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
