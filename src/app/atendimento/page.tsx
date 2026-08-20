"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Link2Off, MessageCircle, Paperclip, Phone, PlugZap, RefreshCcw, Send, User } from "lucide-react";
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
import type { ChatwootAttachment, ChatwootConversationDetail, ChatwootConversationSummary, ChatwootInbox, ChatwootMessageItem } from "@/lib/chatwoot/client";

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
  code: string | null;
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
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null, notConfigured: false, code: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!url) {
      // queueMicrotask avoids the "setState synchronously within an effect"
      // cascading-render lint rule — same pattern as useApi() in
      // lib/client-api.ts.
      queueMicrotask(() => {
        if (!alive) return;
        setState({ data: null, loading: false, error: null, notConfigured: false, code: null });
      });
      return () => {
        alive = false;
      };
    }

    queueMicrotask(() => {
      if (!alive) return;
      setState((s) => ({ ...s, loading: true, error: null, notConfigured: false, code: null }));
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
            code: body?.code ?? null,
          });
          return;
        }
        setState({ data: body as T, loading: false, error: null, notConfigured: false, code: null });
      })
      .catch((err) => {
        if (!alive) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Erro ao carregar dados",
          notConfigured: false,
          code: null,
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
      {/* useSearchParams precisa de um limite de Suspense no App Router. */}
      <Suspense fallback={<ConsoleLoading />}>
        <AtendimentoPageInner />
      </Suspense>
    </AccessGuard>
  );
}

function AtendimentoPageInner() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  // /agentes linka para cá com o inbox do agente (?inboxId=15). Sem ler a query
  // o link caía na lista completa e o usuário tinha que reachar o inbox na mão.
  // Um vendedor com escopo é travado no próprio inbox pelo servidor de qualquer
  // forma, então aqui isso só pré-seleciona o filtro de quem vê tudo.
  const searchParams = useSearchParams();
  const [inboxFilter, setInboxFilter] = useState(searchParams.get("inboxId") ?? "");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Errors silently — a scoped vendor's own inbox is a single option anyway,
  // and this dropdown just doesn't render if it can't load.
  const inboxesFetch = useAtendimentoFetch<{ inboxes: ChatwootInbox[] }>("/api/atendimento/inboxes");
  const inboxes = inboxesFetch.data?.inboxes ?? [];

  // Quantas páginas de 25 pedir. O Chatwoot tem milhares de conversas e devolve
  // 25 por vez; começar com 2 abre a tela rápido e o botão "carregar mais"
  // busca o resto sob demanda.
  const [paginas, setPaginas] = useState(2);
  useEffect(() => setPaginas(2), [inboxFilter]);

  const list = useAtendimentoFetch<{
    conversations: ChatwootConversationSummary[];
    totalNoChatwoot: number;
    temMais: boolean;
    scoped: boolean;
  }>(`/api/atendimento/conversations?paginas=${paginas}${inboxFilter ? `&inboxId=${inboxFilter}` : ""}`);
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

  if (list.code === "chatwoot_inbox_not_linked") {
    return (
      <ConsolePage title="Atendimento" subtitle="Conversas do WhatsApp via Chatwoot">
        <ConsoleCard className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-400">
            <Link2Off size={22} />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Seu número ainda não foi vinculado</h2>
            <p className="mx-auto mt-2 max-w-md text-[12px] text-[var(--text-muted)]">
              Peça a um administrador para vincular seu usuário a um número do Chatwoot em Admin → menu do seu usuário → &quot;Número Chatwoot (Atendimento)&quot;.
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
          {list.data?.scoped === false && inboxes.length > 0 && (
            <select
              value={inboxFilter}
              onChange={(e) => setInboxFilter(e.target.value)}
              aria-label="Filtrar por número"
              className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 text-[12px] text-[var(--text-primary)]"
            >
              <option value="">Todos os números</option>
              {inboxes.map((ib) => (
                <option key={ib.id} value={String(ib.id)}>{ib.name}</option>
              ))}
            </select>
          )}
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
              {/* "N no total" mentia: eram N da primeira página, de milhares no
                  Chatwoot. Agora diz quantas estão carregadas e quantas existem. */}
              <p className="text-[11px] text-[var(--text-muted)]">
                {filtered.length} carregada{filtered.length !== 1 ? "s" : ""}
                {list.data?.totalNoChatwoot ? ` · ${list.data.totalNoChatwoot.toLocaleString("pt-BR")} no Chatwoot` : ""}
              </p>
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
                    <p className="flex min-w-0 items-center gap-2 truncate text-[12px] font-bold text-[var(--text-primary)]">
                      <Avatar url={c.contactAvatar} nome={c.contactName} tamanho={22} />
                      <span className="truncate">{c.contactName ?? "Contato sem nome"}</span>
                    </p>
                    <ConsoleStatus tone={STATUS_TONES[c.status] ?? "slate"}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </ConsoleStatus>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {c.contactPhone && (
                      <p className="flex items-center gap-1 font-data text-[11px] text-[var(--text-muted)]">
                        <Phone size={10} /> {c.contactPhone}
                      </p>
                    )}
                    {c.inboxName && (
                      <span className="truncate rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                        {c.inboxName}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-[var(--text-secondary)]">{c.lastMessage ?? "Sem mensagens"}</p>
                  <LabelChips labels={c.labels} />
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
              {list.data?.temMais && !search.trim() && (
                <button
                  onClick={() => setPaginas((p) => p + 4)}
                  disabled={list.loading}
                  className="w-full border-t border-[var(--border)] px-4 py-3 text-[12px] font-semibold text-blue-400 transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                >
                  {list.loading ? "Carregando..." : "Carregar mais conversas"}
                </button>
              )}
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
                    <Avatar url={conv.contactAvatar} nome={conv.contactName} tamanho={32} />
                    <div>
                      <p className="text-[13px] font-bold text-[var(--text-primary)]">{conv.contactName ?? "Contato sem nome"}</p>
                      <p className="flex items-center gap-1 font-data text-[11px] text-[var(--text-muted)]">
                        <Phone size={10} /> {conv.contactPhone ?? "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.inboxName && (
                      <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                        {conv.inboxName}
                      </span>
                    )}
                    <ConsoleStatus tone={STATUS_TONES[conv.status] ?? "slate"}>
                      {STATUS_LABELS[conv.status] ?? conv.status}
                    </ConsoleStatus>
                  </div>
                </div>

                {conv.labels.length > 0 && (
                  <div className="border-b border-[var(--border)] px-4 py-2">
                    <LabelChips labels={conv.labels} />
                  </div>
                )}

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

function LabelChips({ labels }: { labels: { title: string; color: string }[] }) {
  if (!labels.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l.title}
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${l.color}26`, color: l.color }}
        >
          {l.title}
        </span>
      ))}
    </div>
  );
}

/**
 * Foto de perfil do WhatsApp, com a inicial do contato como reserva.
 *
 * O Chatwoot serve a imagem por uma URL de redirect do Active Storage que pode
 * expirar ou vir de contato sem foto — daí o `onError`, para a lista não ficar
 * com quadrado quebrado em vez de rosto.
 */
function Avatar({ url, nome, tamanho }: { url: string | null; nome: string | null; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tamanho, height: tamanho };
  const inicial = (nome ?? "").trim().replace(/^~/, "").charAt(0).toUpperCase();

  if (!url || falhou) {
    return (
      <span
        style={estilo}
        className="grid shrink-0 place-items-center rounded-full bg-blue-500/10 text-[11px] font-bold text-blue-300"
      >
        {inicial || <User size={Math.round(tamanho * 0.5)} />}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={estilo}
      onError={() => setFalhou(true)}
      className="shrink-0 rounded-full object-cover"
    />
  );
}

/**
 * Renderiza o anexo pelo que ele é: áudio vira player, imagem vira imagem, o
 * resto vira link. O Chatwoot serve o arquivo em `data_url`, e até aqui o CRM
 * descartava esse campo — mensagem de voz aparecia como o texto "[audio]" e
 * não havia como ouvir sem abrir o Chatwoot por fora.
 */
function Anexo({ anexo, isOutgoing }: { anexo: ChatwootAttachment; isOutgoing: boolean }) {
  if (anexo.tipo === "audio") {
    return <audio controls preload="none" src={anexo.url} className="mt-1 w-[260px] max-w-full" />;
  }
  if (anexo.tipo === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={anexo.url} target="_blank" rel="noopener noreferrer">
        <img src={anexo.url} alt="Imagem recebida" className="mt-1 max-h-[260px] rounded-[8px]" />
      </a>
    );
  }
  if (anexo.tipo === "video") {
    return <video controls preload="none" src={anexo.url} className="mt-1 max-h-[260px] rounded-[8px]" />;
  }
  return (
    <a
      href={anexo.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1 flex items-center gap-1.5 text-[12px] underline ${isOutgoing ? "text-blue-100" : "text-blue-400"}`}
    >
      <Paperclip size={12} />
      Abrir anexo
    </a>
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
        {/* Mensagem de voz vem com `content` "[audio]" ou vazio — o texto sozinho
            não vale nada, e repeti-lo acima do player é ruído. */}
        {message.content && !(message.attachments.length && /^\[\w+\]$/.test(message.content.trim())) && message.content}
        {message.attachments.map((a) => (
          <Anexo key={a.url} anexo={a} isOutgoing={isOutgoing} />
        ))}
        {message.createdAt && (
          <p className={`mt-1 text-[10px] ${isOutgoing ? "text-blue-100/70" : "text-[var(--text-muted)]"}`}>
            {formatDateTime(message.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}
