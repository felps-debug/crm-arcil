/* ================================================================
   ARCIL CRM — Cliente da Chatwoot Application API (server-only)
   Mirrors src/lib/supabase/admin.ts: env vars are read once (in
   lib/env.ts) but NOT validated at import time — validation happens
   lazily, inside getConfig(), only when a request is actually made.
   This means the app never crashes just because Chatwoot hasn't been
   wired up yet in this environment; callers see a clear
   ChatwootNotConfiguredError instead.
   ================================================================ */

import {
  CHATWOOT_BASE_URL,
  CHATWOOT_ACCOUNT_ID,
  CHATWOOT_API_ACCESS_TOKEN,
} from "@/lib/env";

export const CHATWOOT_NOT_CONFIGURED_MESSAGE = "Integração do Chatwoot ainda não configurada.";

/** Thrown when CHATWOOT_BASE_URL / CHATWOOT_ACCOUNT_ID / CHATWOOT_API_ACCESS_TOKEN are missing. */
export class ChatwootNotConfiguredError extends Error {
  constructor() {
    super(CHATWOOT_NOT_CONFIGURED_MESSAGE);
    this.name = "ChatwootNotConfiguredError";
  }
}

/** Thrown when Chatwoot responds with a non-2xx status, or the request fails outright. */
export class ChatwootApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatwootApiError";
    this.status = status;
  }
}

function getConfig() {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_ACCESS_TOKEN) {
    throw new ChatwootNotConfiguredError();
  }
  return {
    baseUrl: CHATWOOT_BASE_URL.replace(/\/+$/, ""),
    accountId: CHATWOOT_ACCOUNT_ID,
    token: CHATWOOT_API_ACCESS_TOKEN,
  };
}

async function chatwootFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, accountId, token } = getConfig();
  const url = `${baseUrl}/api/v1/accounts/${accountId}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        api_access_token: token,
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    throw new ChatwootApiError(0, `Falha de rede ao contatar o Chatwoot: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && (body.message || body.error)) ||
      `Chatwoot respondeu ${res.status}`;
    throw new ChatwootApiError(res.status, String(message));
  }
  return body as T;
}

/** Chatwoot's list endpoints wrap the array under different keys depending on
 * version/endpoint (`{ data: { payload: [] } }`, `{ payload: [] }`, or a bare
 * array) — normalize defensively instead of assuming one exact shape. */
function extractArray<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const b = body as Record<string, unknown> | null;
  const data = b?.data as Record<string, unknown> | unknown[] | undefined;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).payload)) {
    return (data as Record<string, unknown>).payload as T[];
  }
  if (b && Array.isArray(b.payload)) return b.payload as T[];
  return [];
}

/* ── Raw Chatwoot shapes (partial — only the fields this module uses) ──── */

interface ChatwootSenderRaw {
  id?: number;
  name?: string | null;
  type?: string;
  phone_number?: string | null;
  email?: string | null;
}

interface ChatwootMessageRaw {
  id: number;
  content: string | null;
  message_type: number; // 0 = incoming, 1 = outgoing, 2 = activity/template
  private?: boolean;
  created_at?: number; // unix seconds
  sender?: ChatwootSenderRaw | null;
}

interface ChatwootConversationRaw {
  id: number;
  inbox_id?: number;
  status?: string;
  unread_count?: number;
  timestamp?: number;
  contact_last_seen_at?: number;
  labels?: string[];
  meta?: {
    sender?: ChatwootSenderRaw;
    assignee?: { id?: number; name?: string } | null;
  };
  messages?: ChatwootMessageRaw[];
}

/* ── Normalized shapes returned to API routes / the UI ──────────────────── */

export interface ChatwootMessageItem {
  id: number;
  content: string;
  direction: "incoming" | "outgoing" | "activity";
  private: boolean;
  senderName: string | null;
  createdAt: string | null; // ISO
}

export interface ChatwootLabel {
  title: string;
  color: string;
}

export interface ChatwootConversationSummary {
  id: number;
  status: string;
  inboxId: number | null;
  inboxName: string | null;
  unreadCount: number;
  lastActivityAt: string | null; // ISO
  contactName: string | null;
  contactPhone: string | null;
  assigneeName: string | null;
  lastMessage: string | null;
  labels: ChatwootLabel[];
}

export interface ChatwootInbox {
  id: number;
  name: string;
}

export interface ChatwootConversationDetail extends ChatwootConversationSummary {
  messages: ChatwootMessageItem[];
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function toDirection(messageType: number): ChatwootMessageItem["direction"] {
  if (messageType === 1) return "outgoing";
  if (messageType === 0) return "incoming";
  return "activity";
}

function normalizeMessage(m: ChatwootMessageRaw): ChatwootMessageItem {
  return {
    id: m.id,
    content: m.content ?? "",
    direction: toDirection(m.message_type),
    private: Boolean(m.private),
    senderName: m.sender?.name ?? null,
    createdAt: toIso(m.created_at),
  };
}

function normalizeConversation(
  c: ChatwootConversationRaw,
  inboxNames: Map<number, string>,
  labelColors: Map<string, string>
): ChatwootConversationSummary {
  const lastMessage = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
  return {
    id: c.id,
    status: c.status ?? "open",
    inboxId: c.inbox_id ?? null,
    inboxName: c.inbox_id != null ? inboxNames.get(c.inbox_id) ?? null : null,
    unreadCount: c.unread_count ?? 0,
    lastActivityAt: toIso(c.timestamp ?? c.contact_last_seen_at),
    contactName: c.meta?.sender?.name ?? null,
    contactPhone: c.meta?.sender?.phone_number ?? null,
    assigneeName: c.meta?.assignee?.name ?? null,
    lastMessage: lastMessage?.content ?? null,
    labels: (c.labels ?? []).map((title) => ({ title, color: labelColors.get(title) ?? "#64748b" })),
  };
}

/** GET /inboxes — every WhatsApp number/channel connected to the account. */
export async function listInboxes(): Promise<ChatwootInbox[]> {
  const body = await chatwootFetch<{ payload?: { id: number; name: string }[] }>("/inboxes");
  return (body.payload ?? []).map((i) => ({ id: i.id, name: i.name }));
}

/** GET /labels — every tag defined on the account, with its display color. */
export async function listLabels(): Promise<ChatwootLabel[]> {
  const body = await chatwootFetch<{ payload?: { title: string; color: string }[] }>("/labels");
  return (body.payload ?? []).map((l) => ({ title: l.title, color: l.color }));
}

async function fetchLookups() {
  const [inboxes, labels] = await Promise.all([listInboxes(), listLabels()]);
  return {
    inboxNames: new Map(inboxes.map((i) => [i.id, i.name])),
    labelColors: new Map(labels.map((l) => [l.title, l.color])),
  };
}

/**
 * GET /conversations — inbox list, newest activity first.
 * opts.inboxId scopes to a single Chatwoot inbox — used both for the staff
 * filter dropdown and to enforce per-vendor scoping server-side (see
 * requireAtendimentoScope in api-auth.ts).
 */
export async function listConversations(opts?: { status?: string; inboxId?: number }): Promise<ChatwootConversationSummary[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.inboxId != null) params.set("inbox_id", String(opts.inboxId));
  const qs = params.toString() ? `?${params.toString()}` : "";

  const [body, { inboxNames, labelColors }] = await Promise.all([chatwootFetch<unknown>(`/conversations${qs}`), fetchLookups()]);
  const raw = extractArray<ChatwootConversationRaw>(body);
  return raw
    .map((c) => normalizeConversation(c, inboxNames, labelColors))
    // Every Arcil inbox is a WhatsApp number tied to a vendor; a real lead
    // always has a contact phone. A conversation with no phone is a WhatsApp
    // GROUP the vendor's personal number happens to be in (confirmed against
    // the live instance on 2026-08-03 — e.g. a car-raffle community group
    // leaking into the "Vinicius - Construtor" inbox), not an Arcil lead.
    .filter((c) => c.contactPhone !== null)
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

/** GET /conversations/{id}/messages — full message thread, oldest first. */
export async function listMessages(conversationId: string | number): Promise<ChatwootMessageItem[]> {
  const body = await chatwootFetch<unknown>(`/conversations/${conversationId}/messages`);
  const raw = extractArray<ChatwootMessageRaw>(body);
  return raw
    .map(normalizeMessage)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/** GET /conversations/{id} — conversation metadata + its full message thread. */
export async function getConversation(conversationId: string | number): Promise<ChatwootConversationDetail> {
  const [conv, messages, { inboxNames, labelColors }] = await Promise.all([
    chatwootFetch<ChatwootConversationRaw>(`/conversations/${conversationId}`),
    listMessages(conversationId),
    fetchLookups(),
  ]);
  return { ...normalizeConversation(conv, inboxNames, labelColors), messages };
}

/** POST /conversations/{id}/messages — send an outgoing reply as the logged-in agent. */
export async function sendMessage(conversationId: string | number, content: string): Promise<ChatwootMessageItem> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Mensagem vazia.");

  const body = await chatwootFetch<ChatwootMessageRaw>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: trimmed, message_type: "outgoing", private: false }),
  });
  return normalizeMessage(body);
}
