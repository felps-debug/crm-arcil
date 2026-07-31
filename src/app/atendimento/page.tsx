"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Phone, PlugZap, RefreshCcw, Send, User } from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsolePage,
  ConsoleStatus,
} from "@/components/console/console-shell";
import { AccessGuard } from "@/components/layout/access-guard";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/client-api";
import type { ChatwootConversationDetail, ChatwootConversationSummary, ChatwootMessageItem } from "@/lib/chatwoot/client";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  resolved: "Resolvida",
  snoozed: "Adiada",
};

const STATUS_TONES: Record<string, "green" | "amber" | "slate" | "violet"> = {
  open: "green",
  pending: "amber",
  resolved: "slate",
  snoozed: "violet",
};

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  notConfigured: boolean;
}

/**
 * Small local GET-fetch hook, deliberately not the shared useApi() from
 * lib/client-api.ts — this page needs to distinguish "Chatwoot isn't
 * configured yet" (code: "chatwoot_not_configured", show a calm setup
 * message) from any other error (show ConsoleError), and useApi's contract
 * only surfaces `error: string`. Rather than reshape a hook other pages
 * depend on, this page carries its own minimal variant.
 */
function useAtendimentoFetch<T>(url: string | null): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null, notConfigured: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!url) {
      // queueMicrotask avoids the "setState synchronously within an effect"
      // cascading-render lint rule — same pattern as useApi() in
      // lib/client-api.ts.
      queueMicrotask(() => {
        if (!alive) return;
        setState({ data: null, loading: false, error: null, notConfigured: false });
      });
      return () => {
        alive = false;
      };
    }

    queueMicrotask(() => {
      if (!alive) return;
      setState((s) => ({ ...s, loading: true, error: null, notConfigured: false }));
    });

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setState({
            data: null,
            loading: false,
            error: body?.error ?? `HTTP ${res.status}`,
            notConfigured: body?.code === "chatwoot_not_configured",
          });
          return;
        }
        setState({ data: body as T, loading: false, error: null, notConfigured: false });
      })
      .catch((err) => {
        if (!alive) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Erro ao carregar dados",
          notConfigured: false,
        });
      });

    return () => {
      alive = false;
    };
  }, [url, tick]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}

export default function AtendimentoPage() {
  return (
    <AccessGuard perm="manage_atendimento">
      <AtendimentoPageInner />
    </AccessGuard>
  );
}

function AtendimentoPageInner() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const list = useAtendimentoFetch<{ conversations: ChatwootConversationSummary[] }>("/api/atendimento/conversations");
  const detail = useAtendimentoFetch<{ conversation: ChatwootConversationDetail }>(
    selectedId ? `/api/atendimento/conversations/${selectedId}` : null
  );

  const conversations = useMemo(() => list.data?.conversations ?? [], [list.data]);

  useEffect(() => {
    if (selectedId === null && conversations.length > 0) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => (c.contactName ?? "").toLowerCase().includes(q) || (c.contactPhone ?? "").includes(q)
    );
  }, [conversations, search]);

  const conv = detail.data?.conversation ?? null;

  async function handleSend() {
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/atendimento/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.error) {
        toast(body?.error ?? "Erro ao enviar mensagem.", "error");
        return;
      }
      setReplyText("");
      detail.refetch();
      list.refetch();
    } catch {
      toast("Erro de conexão ao enviar mensagem.", "error");
    } finally {
      setSending(false);
    }
  }

  if (list.notConfigured) {
    return (
      <ConsolePage title="Atendimento" subtitle="Conversas do WhatsApp via Chatwoot">
        <ConsoleCard className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-400">
            <PlugZap size={22} />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Integração do Chatwoot ainda não configurada</h2>
            <p className="mx-auto mt-2 max-w-md text-[12px] text-[var(--text-muted)]">
              Defina as variáveis <code>CHATWOOT_BASE_URL</code>, <code>CHATWOOT_ACCOUNT_ID</code> e{" "}
              <code>CHATWOOT_API_ACCESS_TOKEN</code> para habilitar o inbox de atendimento.
            </p>
          </div>
        </ConsoleCard>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage
      title="Atendimento"
      subtitle="Conversas do WhatsApp via Chatwoot"
      actions={
        <>
          <ConsoleInput
            placeholder="Buscar contato ou telefone..."
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ConsoleButton
            icon={RefreshCcw}
            onClick={() => {
              list.refetch();
              if (selectedId) detail.refetch();
            }}
          >
            Atualizar
          </ConsoleButton>
        </>
      }
    >
      {list.loading && <ConsoleLoading />}
      {list.error && !list.loading && <ConsoleError message={list.error} />}

      {!list.loading && !list.error && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <ConsoleCard pad={false} className="flex h-[min(680px,75dvh)] flex-col">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Conversas</h2>
              <p className="text-[11px] text-[var(--text-muted)]">{filtered.length} no total</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="p-4 text-[12px] text-[var(--text-muted)]">Nenhuma conversa encontrada.</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`block w-full border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--bg-subtle)] ${
                    selectedId === c.id ? "bg-[var(--bg-subtle)]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-bold text-[var(--text-primary)]">
                      {c.contactName ?? "Contato sem nome"}
                    </p>
                    <ConsoleStatus tone={STATUS_TONES[c.status] ?? "slate"}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </ConsoleStatus>
                  </div>
                  {c.contactPhone && (
                    <p className="mt-0.5 flex items-center gap-1 font-data text-[11px] text-[var(--text-muted)]">
                      <Phone size={10} /> {c.contactPhone}
                    </p>
                  )}
                  <p className="mt-1.5 truncate text-[11px] text-[var(--text-secondary)]">{c.lastMessage ?? "Sem mensagens"}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-[var(--text-muted)]">{formatDateTime(c.lastActivityAt)}</span>
                    {c.unreadCount > 0 && (
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ConsoleCard>

          <ConsoleCard pad={false} className="flex h-[min(680px,75dvh)] flex-col">
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
                <MessageCircle size={22} />
                <p className="text-[12px] font-medium">Selecione uma conversa para ver as mensagens.</p>
              </div>
            ) : detail.loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="animate-spin text-blue-400" size={20} />
              </div>
            ) : detail.notConfigured ? (
              <div className="flex flex-1 items-center justify-center p-4 text-center text-[12px] text-amber-400">
                Integração do Chatwoot ainda não configurada.
              </div>
            ) : detail.error ? (
              <div className="flex flex-1 items-center justify-center p-4 text-center text-[12px] text-red-300">{detail.error}</div>
            ) : !conv ? (
              <div className="flex flex-1 items-center justify-center p-4 text-center text-[12px] text-[var(--text-muted)]">
                Não foi possível carregar esta conversa.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-500/10 text-blue-300">
                      <User size={15} />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-[var(--text-primary)]">{conv.contactName ?? "Contato sem nome"}</p>
                      <p className="flex items-center gap-1 font-data text-[11px] text-[var(--text-muted)]">
                        <Phone size={10} /> {conv.contactPhone ?? "-"}
                      </p>
                    </div>
                  </div>
                  <ConsoleStatus tone={STATUS_TONES[conv.status] ?? "slate"}>
                    {STATUS_LABELS[conv.status] ?? conv.status}
                  </ConsoleStatus>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {conv.messages.length === 0 && (
                    <p className="text-[12px] text-[var(--text-muted)]">Nenhuma mensagem nesta conversa.</p>
                  )}
                  {conv.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>

                <div className="border-t border-[var(--border)] p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder="Escreva uma resposta..."
                      rows={2}
                      className="flex-1 resize-none rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
                    />
                    <ConsoleButton icon={sending ? Loader2 : Send} active onClick={handleSend} disabled={sending || !replyText.trim()}>
                      {sending ? "Enviando..." : "Enviar"}
                    </ConsoleButton>
                  </div>
                </div>
              </>
            )}
          </ConsoleCard>
        </div>
      )}
    </ConsolePage>
  );
}

function MessageBubble({ message }: { message: ChatwootMessageItem }) {
  if (message.direction === "activity") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-[var(--bg-subtle)] px-3 py-1 text-[10px] font-medium text-[var(--text-muted)]">
          {message.content}
        </span>
      </div>
    );
  }

  const isOutgoing = message.direction === "outgoing";
  return (
    <div className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-[12px] px-3 py-2 text-[13px] ${
          isOutgoing
            ? "rounded-tr-none bg-blue-500 text-white"
            : "rounded-tl-none border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text-primary)]"
        }`}
      >
        {message.content}
        {message.createdAt && (
          <p className={`mt-1 text-[10px] ${isOutgoing ? "text-blue-100/70" : "text-[var(--text-muted)]"}`}>
            {formatDateTime(message.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}
