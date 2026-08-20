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
  /** Foto de perfil do WhatsApp, servida pelo próprio Chatwoot. */
  thumbnail?: string | null;
}

interface ChatwootMessageRaw {
  id: number;
  content: string | null;
  message_type: number; // 0 = incoming, 1 = outgoing, 2 = activity/template
  private?: boolean;
  created_at?: number; // unix seconds
  sender?: ChatwootSenderRaw | null;
  attachments?: ChatwootAttachmentRaw[] | null;
}

/** Áudio, imagem e arquivo chegam aqui, não em `content`: uma mensagem de voz
 *  vem com `content` vazio ou "[audio]" e o arquivo de verdade neste array. */
interface ChatwootAttachmentRaw {
  id?: number;
  file_type?: string;
  data_url?: string | null;
  thumb_url?: string | null;
  file_size?: number | null;
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

export interface ChatwootAttachment {
  /** Como o Chatwoot classificou: "audio", "image", "video", "file". */
  tipo: string;
  url: string;
  tamanho: number | null;
}

export interface ChatwootMessageItem {
  id: number;
  content: string;
  attachments: ChatwootAttachment[];
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
  contactAvatar: string | null;
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
    // Sem isto a mensagem de voz aparecia como o texto "[audio]" e não havia
    // como ouvir: o arquivo mora em `attachments[].data_url` e o normalizador
    // descartava o campo inteiro.
    attachments: (m.attachments ?? [])
      .filter((a) => Boolean(a?.data_url))
      .map((a) => ({ tipo: a.file_type ?? "file", url: a.data_url as string, tamanho: a.file_size ?? null })),
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
    // O Chatwoot já entrega a foto do WhatsApp e o CRM descartava — mesmo
    // descuido dos anexos de áudio. Vinte das 25 conversas da primeira página
    // têm foto.
    contactAvatar: c.meta?.sender?.thumbnail || null,
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
/** O Chatwoot devolve 25 conversas por página, sempre. */
const POR_PAGINA = 25;

/**
 * Só o total, sem trazer conversa nenhuma — o Chatwoot manda `meta.all_count`
 * junto da primeira página, então uma requisição basta.
 *
 * Usado no dashboard, que precisa do número e não da lista.
 */
export async function contarConversas(status: "open" | "resolved" | "pending" | "all" = "open"): Promise<number> {
  const body = await chatwootFetch<{ data?: { meta?: { all_count?: number } }; meta?: { all_count?: number } }>(
    `/conversations?status=${status}&page=1`
  );
  return body?.data?.meta?.all_count ?? body?.meta?.all_count ?? 0;
}

export interface ListaDeConversas {
  conversations: ChatwootConversationSummary[];
  /** Quantas o Chatwoot tem no total, incluindo grupos e as não carregadas. */
  totalNoChatwoot: number;
  /** Quantas páginas foram lidas de fato. */
  paginasLidas: number;
  temMais: boolean;
}

/**
 * Lista as conversas, paginando.
 *
 * Antes buscava só a primeira página e a tela dizia "16 no total" — eram 16 da
 * primeira página de 3.096 conversas, com 9 grupos já descontados. O número
 * parecia o total do Chatwoot e não era nem o total da página.
 *
 * `paginas` limita quanto se lê de uma vez: 3.096 conversas seriam 124 chamadas
 * em série, e a tela não pode esperar isso para abrir. A UI pede mais quando
 * precisa.
 */
export async function listConversations(opts?: {
  status?: string;
  inboxId?: number;
  paginas?: number;
}): Promise<ListaDeConversas> {
  const paginas = Math.min(Math.max(opts?.paginas ?? 2, 1), 20);
  const base = new URLSearchParams();
  if (opts?.status) base.set("status", opts.status);
  if (opts?.inboxId != null) base.set("inbox_id", String(opts.inboxId));

  const { inboxNames, labelColors } = await fetchLookups();

  const cruas: ChatwootConversationRaw[] = [];
  let totalNoChatwoot = 0;
  let temMais = false;
  let paginasLidas = 0;

  for (let pagina = 1; pagina <= paginas; pagina++) {
    const params = new URLSearchParams(base);
    params.set("page", String(pagina));
    const body = await chatwootFetch<unknown>(`/conversations?${params.toString()}`);
    const lote = extractArray<ChatwootConversationRaw>(body);
    paginasLidas = pagina;

    const meta = (body as { data?: { meta?: { all_count?: number } }; meta?: { all_count?: number } } | null);
    totalNoChatwoot = meta?.data?.meta?.all_count ?? meta?.meta?.all_count ?? totalNoChatwoot;

    cruas.push(...lote);
    if (lote.length < POR_PAGINA) break;
    if (pagina === paginas) temMais = true;
  }

  const conversations = cruas
    .map((c) => normalizeConversation(c, inboxNames, labelColors))
    // Every Arcil inbox is a WhatsApp number tied to a vendor; a real lead
    // always has a contact phone. A conversation with no phone is a WhatsApp
    // GROUP the vendor's personal number happens to be in (confirmed against
    // the live instance on 2026-08-03 — e.g. a car-raffle community group
    // leaking into the "Vinicius - Construtor" inbox), not an Arcil lead.
    .filter((c) => c.contactPhone !== null)
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));

  return { conversations, totalNoChatwoot, paginasLidas, temMais };
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
