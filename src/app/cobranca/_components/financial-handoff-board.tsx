"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MessageSquare, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ConsoleButton, ConsoleCard, ConsoleError, ConsoleLoading, ConsoleStatus } from "@/components/console/console-shell";
import { createClient } from "@/lib/supabase/client";
import type { FinancialBoardColumn, FinancialBoardItem, FinancialHandoffDecisionStatus } from "@/lib/server/financial-handoff";
import type { LeadConversationsResponse } from "@/lib/server/crm-data";

type Choice = "em_aberto" | FinancialHandoffDecisionStatus;
type BoardResponse = { items?: FinancialBoardItem[]; error?: string };

const columns: { id: FinancialBoardColumn; label: string; empty: string }[] = [
  { id: "awaiting_response", label: "Aguardando resposta", empty: "Nenhuma cobrança aguardando resposta." },
  { id: "human", label: "Em atendimento humano", empty: "Nenhum atendimento humano ativo." },
  { id: "awaiting_return", label: "Aguardando retorno", empty: "Nenhuma retomada programada." },
  { id: "resolved", label: "Resolvido", empty: "Nenhum atendimento resolvido recentemente." },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function key(empresa: string, documento: string) {
  return `${empresa}\u0000${documento}`;
}

/** "dd/mm/aaaa" -> Date, ou null se ilegível. O boleto guarda vencimento como texto solto do ERP; sem isso não dá pra saber quem está mais atrasado. */
function parseVencimento(texto: string | null): Date | null {
  if (!texto) return null;
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, dia, mes, anoStr] = m;
  const ano = anoStr.length === 2 ? 2000 + Number(anoStr) : Number(anoStr);
  const data = new Date(ano, Number(mes) - 1, Number(dia));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Vencimento mais antigo entre os boletos em aberto do card — é o que decide prioridade de cobrança, não o mais recente. */
function vencimentoMaisAntigo(item: FinancialBoardItem): { data: Date; texto: string } | null {
  let melhor: { data: Date; texto: string } | null = null;
  for (const boleto of item.boletos) {
    const data = parseVencimento(boleto.vencimento);
    if (data && (!melhor || data < melhor.data)) melhor = { data, texto: boleto.vencimento! };
  }
  return melhor;
}

function returnDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
}

function assumedTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null;
}

export function FinancialHandoffBoard() {
  const [items, setItems] = useState<FinancialBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cobranca/financial-handoffs", { cache: "no-store" });
      const body = await response.json().catch(() => null) as BoardResponse | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar os atendimentos financeiros.");
      setItems(body?.items ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os atendimentos financeiros.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase.channel("financial-handoff-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_handoff_resolutions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_handoff_boleto_decisions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name?.toLowerCase().includes(q) || item.phone.includes(q));
  }, [items, search]);

  const grouped = useMemo(() => new Map(columns.map((column) => [
    column.id,
    // Vencimento mais antigo primeiro — quem está mais atrasado sobe pro topo
    // da coluna, em vez de ficar perdido atrás de cards mais recentes.
    filteredItems
      .filter((item) => item.column === column.id)
      .sort((a, b) => (vencimentoMaisAntigo(a)?.data.getTime() ?? Infinity) - (vencimentoMaisAntigo(b)?.data.getTime() ?? Infinity)),
  ])), [filteredItems]);
  const totals = useMemo(() => items.reduce(
    (sum, item) => ({ open: sum.open + item.openAmount, paid: sum.paid + item.paidAmount }),
    { open: 0, paid: 0 }
  ), [items]);

  if (loading && !items.length) return <ConsoleLoading />;
  if (error && !items.length) return <ConsoleError message={error} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Atendimentos financeiros</h2>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Feche boleto por boleto sem abrir Leads ou o Kanban geral.</p>
        </div>
        <div className="flex items-center gap-4">
          {/* O board mostrava só o que falta receber. Sem o recebido ao lado, não
              dá para saber se a operação está andando ou parada. */}
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recebido</p>
            <p className="font-data text-[15px] font-bold text-[var(--emerald)]">{money(totals.paid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Em aberto</p>
            <p className="font-data text-[15px] font-bold text-[var(--text-primary)]">{money(totals.open)}</p>
          </div>
          <button onClick={load} className="rounded-[8px] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Atualizar atendimentos">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <div className="relative w-64">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Nome ou telefone..."
          aria-label="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500/60"
        />
      </div>
      {error && <ConsoleError message={error} />}
      <div className="grid gap-3 xl:grid-cols-4">
        {columns.map((column) => {
          const columnItems = grouped.get(column.id) ?? [];
          const columnTotal = columnItems.reduce((sum, item) => sum + item.openAmount, 0);
          return <section key={column.id} className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{column.label}</h3>
              <span className="flex items-center gap-1.5 font-data text-[11px] text-[var(--text-muted)]">
                {columnTotal > 0 && <span className="text-[var(--text-secondary)]">{money(columnTotal)}</span>}
                {columnItems.length}
              </span>
            </div>
            <div className="space-y-2">
              {columnItems.map((item) => <FinancialCard key={item.leadId} item={item} onSaved={load} />)}
              {!columnItems.length && <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">{column.empty}</p>}
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}

/**
 * Conversa do agente com aquele número. Carrega só quando alguém abre — o board
 * inteiro puxando mensagem de todo mundo seria caro e quase sempre inútil.
 */
function ConversationHistory({ leadId }: { leadId: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: LeadConversationsResponse | null }>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/conversations`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar a conversa.");
        return body as LeadConversationsResponse;
      })
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((reason) => alive && setState({ loading: false, error: reason.message, data: null }));
    return () => {
      alive = false;
    };
  }, [leadId]);

  if (state.loading) return <p className="px-1 py-2 text-[10px] text-[var(--text-muted)]">Carregando conversa…</p>;
  if (state.error) return <p className="px-1 py-2 text-[10px] text-red-300">{state.error}</p>;

  const messages = (state.data?.conversations ?? []).flatMap((conversation) => conversation.messages);
  if (!messages.length) {
    return <p className="px-1 py-2 text-[10px] text-[var(--text-muted)]">Nenhuma mensagem registrada com este número.</p>;
  }

  return (
    <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
      {messages.map((message) => (
        <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
          <div
            className={`max-w-[85%] rounded-[8px] border px-2 py-1.5 text-[10px] leading-snug ${
              message.role === "user"
                ? "border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)]"
                : "border-blue-500/30 bg-blue-500/10 text-[var(--blue)]"
            }`}
          >
            <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] opacity-60">
              {message.role === "user" ? "Cliente" : "Agente"}
            </span>
            {message.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function FinancialCard({ item, onSaved }: { item: FinancialBoardItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<"devolver_ao_bot" | "sem_retorno">("devolver_ao_bot");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  // A trava era `item.column === "human"`, e isso deixava a tela sem saída:
  //
  // - BRUNO nunca teve handoff aceito, então caía em "aguardando resposta" com
  //   R$ 1.717,15 em três boletos e nenhuma forma de baixar por aqui.
  // - LO AR BRASIL foi aceito, mas registrar UMA resolução joga o card de volta
  //   para "aguardando resposta" (o classificador compara accepted_at com
  //   recorded_at). Depois da primeira decisão ninguém corrigia mais nada.
  //
  // Pior: o card em /leads liberava pelo `Boolean(handoff_accepted_at)` sozinho,
  // então o mesmo boleto do LO AR BRASIL era editável lá e bloqueado aqui.
  //
  // A pergunta que interessa ao financeiro é "tem boleto em aberto para baixar?".
  // A coluna continua informando o estado; ela não decide mais quem pode agir.
  const editable = Boolean(item.cobrancaLogId) && item.boletos.length > 0;
  const emHandoff = Boolean(item.handoffAcceptedAt);
  const precisaReenviar = item.n8nStatus === "failed" && Boolean(item.resolutionId);
  const scheduledDate = returnDate(item.followupAt);
  const assumedAt = assumedTime(item.handoffStaffOkAt);
  // Enviado ao vendedor (handoff_sent_at) e aceito por ele (handoff_accepted_at)
  // são dois momentos distintos — o card so mostra "enviado" enquanto o
  // segundo ainda não aconteceu, senão ele soa como se o financeiro ainda
  // estivesse esperando algo que já foi resolvido.
  const sentAt = !item.handoffAcceptedAt ? assumedTime(item.handoffSentAt) : null;
  const vencido = vencimentoMaisAntigo(item);
  const vencidoAtrasado = vencido ? vencido.data.getTime() < new Date().setHours(0, 0, 0, 0) : false;

  const invalidRenegotiation = item.boletos.some((boleto) => choices[key(boleto.empresa, boleto.documento)] === "renegociado" && !notes[key(boleto.empresa, boleto.documento)]?.trim());

  // Um cliente com muitos boletos abertos esticava o card até estourar a coluna
  // do kanban. A lista rola dentro de uma altura fixa e o resumo diz o que já
  // foi marcado, para não obrigar a percorrer tudo antes de confirmar.
  const marked = item.boletos.filter((boleto) => (choices[key(boleto.empresa, boleto.documento)] ?? "em_aberto") !== "em_aberto");
  const markedAmount = marked.reduce((sum, boleto) => sum + boleto.valor, 0);

  async function reenviarAoN8n() {
    if (!item.resolutionId || reenviando) return;
    setReenviando(true);
    setError(null);
    try {
      const resposta = await fetch(`/api/leads/${item.leadId}/financial-handoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionId: item.resolutionId }),
      });
      const corpo = (await resposta.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!resposta.ok || corpo?.ok !== true) throw new Error(corpo?.error ?? "Não foi possível liberar o bot.");
      onSaved();
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : "Não foi possível liberar o bot.");
    } finally {
      setReenviando(false);
    }
  }

  async function submit() {
    if (!item.cobrancaLogId || saving || invalidRenegotiation) return;
    setSaving(true);
    setError(null);
    const decisions = item.boletos.flatMap((boleto) => {
      const boletoChoice = choices[key(boleto.empresa, boleto.documento)];
      return boletoChoice === "pago" || boletoChoice === "renegociado"
        ? [{ empresa: boleto.empresa, documento: boleto.documento, status: boletoChoice, note: notes[key(boleto.empresa, boleto.documento)]?.trim() || null }]
        : [];
    });
    try {
      const response = await fetch(`/api/leads/${item.leadId}/financial-handoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobrancaLogId: item.cobrancaLogId, destination, decisions }),
      });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? "Não foi possível salvar o atendimento.");
      setOpen(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o atendimento.");
    } finally {
      setSaving(false);
    }
  }

  return <ConsoleCard pad={false} className="overflow-hidden border-[var(--border)] bg-[var(--bg-surface)]">
    <button onClick={() => editable && setOpen((current) => !current)} disabled={!editable} className="w-full p-3 text-left disabled:cursor-default">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-[12px] font-bold text-[var(--text-primary)]">{item.name ?? "Sem nome"}</p><p className="mt-0.5 font-data text-[10px] text-[var(--text-muted)]">{item.phone}</p></div>
        {editable && <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2"><div><p className="font-data text-[14px] font-bold text-[var(--text-primary)]">{money(item.openAmount)}</p><p className="text-[10px] text-[var(--text-muted)]">{item.openBoletoCount} boleto{item.openBoletoCount !== 1 ? "s" : ""} em aberto{vencido && <span className={vencidoAtrasado ? "ml-1 font-semibold text-red-300" : "ml-1"}> · vence {vencido.texto}</span>}</p></div>{assumedAt ? <ConsoleStatus tone="green">Assumido {assumedAt}</ConsoleStatus> : item.origemAtendimento === "manual" ? (
        // Sem este selo, o board mostrava como "atendimento humano" tanto quem
        // gerou card no WhatsApp do financeiro quanto quem alguem simplesmente
        // respondeu pelo Chatwoot — e a conta entre a tela e as mensagens
        // recebidas nunca fechava.
        <ConsoleStatus tone="blue">Assumido no Chatwoot</ConsoleStatus>
      ) : item.origemAtendimento === "card" ? <ConsoleStatus tone="blue">Handoff do agente</ConsoleStatus> : sentAt ? <ConsoleStatus tone="amber">Enviado ao vendedor {sentAt}</ConsoleStatus> : scheduledDate ? <ConsoleStatus tone="amber">Retoma {scheduledDate}</ConsoleStatus> : null}</div>
    </button>
    <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-[var(--border)]"><div className="space-y-2 p-3">
      <div className="flex items-baseline justify-between gap-2 text-[10px]">
        <span className="font-semibold text-[var(--text-muted)]">{marked.length} de {item.boletos.length} marcado{marked.length === 1 ? "" : "s"}</span>
        <span className="font-data font-bold text-[var(--emerald)]">{money(markedAmount)}</span>
      </div>
      <div className="max-h-[264px] space-y-2 overflow-y-auto pr-1">
      {item.boletos.map((boleto) => { const boletoKey = key(boleto.empresa, boleto.documento); const choice = choices[boletoKey] ?? "em_aberto"; return <div key={boletoKey} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5"><div className="flex gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[var(--text-primary)]">{boleto.documento}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{boleto.empresa} · {money(boleto.valor)}{boleto.vencimento && <> · vence {boleto.vencimento}</>}</p></div><select value={choice} onChange={(event) => setChoices((current) => ({ ...current, [boletoKey]: event.target.value as Choice }))} className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text-primary)]"><option value="em_aberto">Em aberto</option><option value="pago">Pago</option><option value="renegociado">Renegociado</option></select></div>{choice === "renegociado" && <textarea value={notes[boletoKey] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [boletoKey]: event.target.value }))} rows={2} placeholder="Condições da renegociação" className="mt-2 w-full resize-none rounded-[6px] border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-[10px] text-[var(--text-primary)]" />}</div>; })}
      </div>

      {/* Antes de baixar um boleto ou devolver ao bot, ver o que o cliente
          respondeu. Fechado por padrão para não empurrar os controles de
          decisão para fora da tela. */}
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)]">
        <button
          onClick={() => setShowConversation((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-[10px] font-bold text-[var(--text-secondary)]"
        >
          <span className="flex items-center gap-1.5">
            <MessageSquare size={11} />
            Conversa com o agente
          </span>
          <ChevronDown size={12} className={`transition-transform ${showConversation ? "rotate-180" : ""}`} />
        </button>
        {showConversation && (
          <div className="border-t border-[var(--border)] p-2">
            <ConversationHistory leadId={item.leadId} />
          </div>
        )}
      </div>

      {/* Escolher o destino do bot só faz sentido para quem esteve com uma
          pessoa: sem handoff o cliente nunca saiu do atendimento automático, e
          não existe bloqueio para liberar. Antes o seletor aparecia sempre e o
          banco recusava com "Lead nao esta em handoff humano assumido" depois
          de o vendedor já ter preenchido tudo. */}
      {emHandoff ? (
        <>
          <div className="grid grid-cols-2 gap-2 pt-1"><label className="rounded-[7px] border border-[var(--border)] px-2 py-2 text-[10px] font-semibold text-[var(--text-secondary)]"><input className="mr-1.5" type="radio" checked={destination === "devolver_ao_bot"} onChange={() => setDestination("devolver_ao_bot")} />Bot agora</label><label className="rounded-[7px] border border-[var(--border)] px-2 py-2 text-[10px] font-semibold text-[var(--text-secondary)]"><input className="mr-1.5" type="radio" checked={destination === "sem_retorno"} onChange={() => setDestination("sem_retorno")} />Sem retorno</label></div>
          {destination === "sem_retorno" && <p className="text-[10px] text-amber-300">O bot retoma somente em três dias úteis, se ainda houver boleto aberto.</p>}
        </>
      ) : (
        <p className="pt-1 text-[10px] text-[var(--text-muted)]">Este cliente não passou por atendimento humano — aqui você só registra a baixa dos boletos.</p>
      )}
      {invalidRenegotiation && <p className="text-[10px] font-semibold text-red-300">Informe a condição de cada renegociação.</p>}{error && <p className="text-[10px] font-semibold text-red-300">{error}</p>}
      <ConsoleButton active className="w-full" disabled={saving || invalidRenegotiation} onClick={submit} icon={saving ? Loader2 : CheckCircle2}>{saving ? "Salvando..." : emHandoff ? "Confirmar atendimento" : "Registrar baixa"}</ConsoleButton>

      {/* A decisão foi salva mas o bot não foi liberado. Sem este reenvio a
          única saída era confirmar de novo, o que grava uma resolução duplicada
          para o mesmo atendimento — foi assim que três resoluções idênticas
          foram parar no banco no dia em que o host do n8n ficou fora do ar. */}
      {precisaReenviar && (
        <div className="space-y-2 rounded-[7px] border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-[10px] leading-relaxed text-amber-200">A baixa está salva, mas o bot não chegou a ser liberado para este cliente.</p>
          <ConsoleButton className="w-full" disabled={reenviando} onClick={reenviarAoN8n} icon={reenviando ? Loader2 : RefreshCw}>
            {reenviando ? "Reenviando..." : "Liberar o bot agora"}
          </ConsoleButton>
        </div>
      )}
    </div></motion.div>}</AnimatePresence>
    {/* Só faz sentido quando há boleto em aberto mas não achamos o disparo que o
        originou. Sem boleto o card já é "resolvido" — avisar ali pedia uma ação
        que não existe. */}
    {item.boletos.length > 0 && !item.cobrancaLogId && <p className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200"><ShieldAlert size={11} className="mr-1 inline" />Atualize a cobrança antes de devolver ao bot.</p>}
  </ConsoleCard>;
}
