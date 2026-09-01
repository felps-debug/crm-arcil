"use client";

import { useCallback, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeftRight, Download, Loader2, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react";
import { ConsoleButton, ConsoleCard } from "@/components/console/console-shell";

export type Posicionamento = { ok: boolean; mensagem: string };
export type Versao = {
  imageUrl: string;
  notes: string | null;
  notesSource: "manual" | "ia" | null;
  posicionamento: Posicionamento | null;
  origem: "geracao" | "ajuste";
};

const CUSTO_APROX_GERACAO = "R$ 0,80";
const TIPOS_CONDENSADORA = [
  ["telhado", "No telhado"],
  ["laje_tecnica", "Laje técnica"],
  ["sacada_tecnica", "Sacada técnica"],
] as const;

const CLASSE_ABA =
  "px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-[var(--text-primary)]";

export function ResultadoPainel({
  generating,
  wallImageUrl,
  versoes,
  versaoAtiva,
  onSelecionarVersao,
  onGerarOutraVersao,
  onDownload,
  downloading,
  revisionPrompt,
  onChangeRevisionPrompt,
  onGerarAjuste,
  condensadoraTipo,
  condensadoraLoading,
  condensadoraImageUrl,
  downloadingCondensadora,
  onGerarCondensadora,
  onDownloadCondensadora,
}: {
  generating: boolean;
  wallImageUrl: string | null;
  versoes: Versao[];
  versaoAtiva: number;
  onSelecionarVersao: (indice: number) => void;
  onGerarOutraVersao: () => void;
  onDownload: () => void;
  downloading: boolean;
  revisionPrompt: string;
  onChangeRevisionPrompt: (v: string) => void;
  onGerarAjuste: () => void;
  condensadoraTipo: "telhado" | "laje_tecnica" | "sacada_tecnica" | null;
  condensadoraLoading: boolean;
  condensadoraImageUrl: string | null;
  downloadingCondensadora: boolean;
  onGerarCondensadora: (tipo: "telhado" | "laje_tecnica" | "sacada_tecnica") => void;
  onDownloadCondensadora: () => void;
}) {
  const versaoAtual = versoes[versaoAtiva] ?? null;
  const generatedImageUrl = versaoAtual?.imageUrl ?? null;
  const compareRef = useRef<HTMLDivElement>(null);
  const [dividerPct, setDividerPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const moverDivisor = useCallback((clientX: number) => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setDividerPct(Math.min(95, Math.max(5, pct)));
  }, []);

  // Clicar em qualquer ponto da faixa já move o divisor — não precisa mais
  // acertar a bolinha pequena pra começar a arrastar (era a queixa: "difícil
  // de arrastar no dedo").
  const onPointerDownFaixa = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      moverDivisor(e.clientX);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [moverDivisor]
  );
  const onPointerMoveFaixa = useCallback((e: React.PointerEvent) => dragging && moverDivisor(e.clientX), [dragging, moverDivisor]);
  const onPointerUpFaixa = useCallback(() => setDragging(false), []);

  if (generating) {
    return (
      <ConsoleCard className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-[12px] font-medium">Gerando visualizacao...</p>
      </ConsoleCard>
    );
  }

  if (!generatedImageUrl || !wallImageUrl) {
    return (
      <ConsoleCard className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--border-strong)] text-center text-[var(--text-muted)]">
        <Sparkles size={22} />
        <p className="max-w-[220px] text-[12px] font-medium">Converse com o assistente pra gerar a visualizacao da instalacao.</p>
      </ConsoleCard>
    );
  }

  return (
    <ConsoleCard>
      <div
        ref={compareRef}
        onPointerDown={onPointerDownFaixa}
        onPointerMove={onPointerMoveFaixa}
        onPointerUp={onPointerUpFaixa}
        onPointerCancel={onPointerUpFaixa}
        className="relative h-[420px] touch-none select-none overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wallImageUrl} alt="Antes" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={generatedImageUrl} alt="Depois" className="h-full w-full object-contain" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 z-10 flex w-0 items-center justify-center" style={{ left: `${dividerPct}%` }}>
          <div className="absolute inset-y-0 w-[2px] bg-blue-400/90" />
          <div className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-blue-500 text-white shadow-lg ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
            <ArrowLeftRight size={14} />
          </div>
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Antes</span>
        <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Depois</span>
      </div>

      {versoes.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Versoes</span>
          {versoes.map((versao, indice) => (
            <button
              key={indice}
              onClick={() => onSelecionarVersao(indice)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                indice === versaoAtiva ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {versao.origem === "ajuste" ? `Ajuste ${indice + 1}` : `V${indice + 1}`}
            </button>
          ))}
        </div>
      )}

      {versaoAtual?.posicionamento && !versaoAtual.posicionamento.ok && (
        <div className="mt-3 flex items-start gap-2 rounded-[8px] border border-amber-500/40 bg-amber-500/10 p-3">
          <ShieldAlert size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-[11px] leading-relaxed text-amber-200">{versaoAtual.posicionamento.mensagem}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <ConsoleButton icon={RefreshCcw} onClick={onGerarOutraVersao}>
            Gerar outra versao
          </ConsoleButton>
          <span className="text-[10px] text-[var(--text-muted)]">
            {versoes.length} {versoes.length === 1 ? "geracao" : "geracoes"} nesta simulacao · ~{CUSTO_APROX_GERACAO} cada
          </span>
        </div>
        <ConsoleButton icon={downloading ? Loader2 : Download} active onClick={onDownload} disabled={downloading}>
          {downloading ? "Baixando..." : "Baixar imagem"}
        </ConsoleButton>
      </div>

      {/* `key={versaoAtiva}` remonta as abas ao trocar de versão — sem isto,
          ficar na aba "Notas" e trocar pra uma versão sem nota deixa o
          Radix com um valor de aba interno que não existe mais (a aba some,
          mas nada reseleciona outra), e o painel fica em branco. */}
      <Tabs.Root key={versaoAtiva} defaultValue="ajuste" className="mt-4">
        <Tabs.List className="flex gap-1 border-b border-[var(--border)]">
          <Tabs.Trigger value="ajuste" className={CLASSE_ABA}>
            Ajustar imagem
          </Tabs.Trigger>
          <Tabs.Trigger value="condensadora" className={CLASSE_ABA}>
            Local da condensadora
          </Tabs.Trigger>
          {versaoAtual?.notes && (
            <Tabs.Trigger value="notas" className={CLASSE_ABA}>
              Nota de instalação
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="ajuste" className="space-y-2 pt-3">
          <p className="text-[11px] text-[var(--text-muted)]">Descreva somente o que precisa mudar. A imagem atual será usada como referência.</p>
          <textarea
            value={revisionPrompt}
            onChange={(e) => onChangeRevisionPrompt(e.target.value)}
            maxLength={1200}
            rows={3}
            placeholder="Ex.: suba a condensadora, mantenha a evaporadora cassete no forro e deixe a tubulação aparente pelo lado direito."
            className="w-full resize-y rounded-[6px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-400"
          />
          <div className="flex justify-end">
            <ConsoleButton onClick={onGerarAjuste} disabled={!revisionPrompt.trim() || generating}>
              Gerar ajuste
            </ConsoleButton>
          </div>
        </Tabs.Content>

        <Tabs.Content value="condensadora" className="space-y-2 pt-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Cenário ilustrativo genérico (não é o local real do cliente) com a condensadora real instalada. Cada opção gera uma imagem nova — custo à parte da simulação principal.
          </p>
          <div className="flex flex-wrap gap-2">
            {TIPOS_CONDENSADORA.map(([tipo, rotulo]) => (
              <ConsoleButton key={tipo} active={condensadoraTipo === tipo} disabled={condensadoraLoading} onClick={() => onGerarCondensadora(tipo)}>
                {condensadoraLoading && condensadoraTipo === tipo ? "Gerando..." : rotulo}
              </ConsoleButton>
            ))}
          </div>
          {condensadoraImageUrl && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={condensadoraImageUrl} alt="Opção de local da condensadora" className="w-full rounded-[8px] border border-[var(--border)]" />
              <ConsoleButton icon={downloadingCondensadora ? Loader2 : Download} onClick={onDownloadCondensadora} disabled={downloadingCondensadora} className="w-full justify-center">
                {downloadingCondensadora ? "Baixando..." : "Baixar imagem do local"}
              </ConsoleButton>
            </div>
          )}
        </Tabs.Content>

        {versaoAtual?.notes && (
          <Tabs.Content value="notas" className="pt-3">
            <InstallationNotesCard notes={versaoAtual.notes} source={versaoAtual.notesSource} />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </ConsoleCard>
  );
}

export function InstallationNotesCard({ notes, source }: { notes: string; source: "manual" | "ia" | null }) {
  return (
    <div className="rounded-[10px] border border-amber-500/25 bg-amber-500/8 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber-400" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
          Nota de instalacao {source === "manual" ? "(manual do fabricante)" : "(gerada por IA)"}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{notes}</p>
      {source === "ia" && (
        <p className="mt-2 text-[10px] text-amber-400/80">Orientacao geral gerada por IA — confirme sempre no manual oficial do fabricante antes de instalar.</p>
      )}
    </div>
  );
}
