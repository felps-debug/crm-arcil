"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertTriangle, BookOpen, X } from "lucide-react";
import type { LiturgiaResponse } from "@/app/api/liturgia/route";

export type TvMetric = { label: string; value: string; tone: "emerald" | "amber" | "blue" | "violet" | "red" };
export type TvAgendaRow = { id: string; domain: string; state: string; owner: string; nextStep: string };
export type TvQueueRow = { id: string; label: string; count: number; severity?: string };
export type TvAttention = { headline: string; detail: string; tone: "amber" | "red" };
export type TvAgent = { id: string; name: string; enabled: boolean; activeLeads: number; conversations: number };
export type TvEvent = { id: string; time: string; type: string; label: string };
export type TvFunnelStep = { id: string; label: string; value: number };

const TONE: Record<TvMetric["tone"], string> = {
  emerald: "var(--emerald)",
  amber: "var(--amber)",
  blue: "var(--blue)",
  violet: "var(--violet)",
  red: "var(--red)",
};

const EVENT_TONE: Record<string, string> = {
  lead: "var(--emerald)",
  cobranca: "var(--amber)",
  followup: "var(--blue)",
};

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)]">
      <h2 className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-[1vw] py-[0.9vh] text-[clamp(10px,1.15vh,17px)] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {icon}
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * Tela cheia para a TV da sala. Sem navegação e sem nada clicável: quem olha
 * está a alguns metros de distância, então tudo aqui é leitura.
 *
 * Mostra MAIS que o dashboard, não um resumo dele — a TV fica ligada o dia
 * inteiro e é onde a operação inteira precisa caber de uma vez. Os tamanhos
 * usam `clamp` com unidade de viewport para acompanhar de um monitor a uma 4K
 * sem breakpoint próprio.
 */
export function TvMode({
  onExit,
  clock,
  realtime,
  attention,
  metrics,
  agenda,
  queues,
  agents,
  events,
  funnel,
  liturgia,
}: {
  onExit: () => void;
  clock: string;
  realtime: "connecting" | "live" | "paused";
  attention: TvAttention | null;
  metrics: TvMetric[];
  agenda: TvAgendaRow[];
  queues: TvQueueRow[];
  agents: TvAgent[];
  events: TvEvent[];
  funnel: TvFunnelStep[];
  liturgia: LiturgiaResponse | null;
}) {
  // Esc sai. Numa TV o mouse costuma estar longe, e prender alguém numa tela
  // cheia sem saída óbvia é o tipo de coisa que faz desligar no botão.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const openQueues = queues.filter((queue) => queue.count > 0);
  const funnelMax = Math.max(...funnel.map((step) => step.value), 1);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col gap-[0.9vh] overflow-hidden bg-[var(--bg-base)] p-[1.6vh_1.8vw] text-[var(--text-primary)]">
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] pb-[1.1vh]">
        <div className="flex items-center gap-4">
          <Image src="/logo-icon.png" alt="Arcil" width={48} height={48} className="h-[clamp(30px,3vh,50px)] w-auto object-contain" />
          <div>
            <p className="text-[clamp(18px,2.2vh,34px)] font-extrabold leading-none tracking-tight">ARCIL</p>
            <p className="mt-1 text-[clamp(9px,1vh,15px)] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Operação em tempo real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2 text-[clamp(10px,1.1vh,16px)] font-bold uppercase tracking-[0.1em]">
            <span
              className="h-[0.8vh] w-[0.8vh] min-h-2 min-w-2 rounded-full"
              style={{ background: realtime === "live" ? "var(--emerald)" : realtime === "paused" ? "var(--red)" : "var(--text-muted)" }}
            />
            <span style={{ color: realtime === "live" ? "var(--emerald)" : "var(--text-muted)" }}>
              {realtime === "live" ? "Ao vivo" : realtime === "paused" ? "Sem conexão" : "Conectando"}
            </span>
          </span>
          <time className="font-data text-[clamp(22px,3vh,48px)] font-bold leading-none">{clock}</time>
          <button
            onClick={onExit}
            aria-label="Sair do modo TV"
            className="rounded-[10px] border border-[var(--border)] p-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {attention && (
        <section
          className="flex shrink-0 items-center gap-4 rounded-[14px] border px-[1.2vw] py-[1.1vh]"
          style={{
            borderColor: attention.tone === "red" ? "color-mix(in srgb, var(--red) 45%, transparent)" : "color-mix(in srgb, var(--amber) 45%, transparent)",
            background: attention.tone === "red" ? "color-mix(in srgb, var(--red) 10%, transparent)" : "color-mix(in srgb, var(--amber) 10%, transparent)",
          }}
        >
          <AlertTriangle
            className="shrink-0"
            style={{ color: attention.tone === "red" ? "var(--red)" : "var(--amber)", width: "clamp(20px,2.4vh,36px)", height: "clamp(20px,2.4vh,36px)" }}
          />
          <div className="min-w-0">
            <p
              className="text-[clamp(16px,2.1vh,32px)] font-extrabold leading-tight"
              style={{ color: attention.tone === "red" ? "var(--red)" : "var(--amber)" }}
            >
              {attention.headline}
            </p>
            <p className="mt-0.5 text-[clamp(10px,1.2vh,18px)] text-[var(--text-secondary)]">{attention.detail}</p>
          </div>
        </section>
      )}

      <section className="grid shrink-0 grid-cols-3 gap-[0.7vw] lg:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] px-[0.9vw] py-[1.1vh]">
            <p className="text-[clamp(8px,0.95vh,14px)] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{metric.label}</p>
            <p className="font-data mt-[0.6vh] text-[clamp(20px,3.2vh,54px)] font-bold leading-none" style={{ color: TONE[metric.tone] }}>
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      {/* Três colunas: operação à esquerda, quem executa no meio, o que
          aconteceu e a leitura do dia à direita. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[0.7vw] xl:grid-cols-[1.5fr_1fr_1.15fr]">
        <div className="grid min-h-0 grid-rows-[1.35fr_1fr] gap-[0.7vh]">
          <Panel title="Agenda operacional">
            <div className="h-full divide-y divide-[var(--border)]">
              {agenda.map((row) => (
                <div key={row.id} className="grid grid-cols-[0.9fr_1.1fr_0.7fr_1fr] items-center gap-2 px-[1vw] py-[0.95vh]">
                  <span className="truncate text-[clamp(12px,1.5vh,23px)] font-bold">{row.domain}</span>
                  <span className="truncate text-[clamp(11px,1.4vh,21px)] font-semibold text-[var(--blue)]">{row.state}</span>
                  <span className="truncate text-[clamp(10px,1.2vh,18px)] text-[var(--text-muted)]">{row.owner}</span>
                  <span className="truncate text-[clamp(10px,1.25vh,19px)] font-semibold text-[var(--text-secondary)]">{row.nextStep}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Funil comercial">
            <div className="flex h-full flex-col justify-center gap-[0.9vh] px-[1vw] py-[0.9vh]">
              {funnel.map((step) => (
                <div key={step.id}>
                  <div className="mb-[0.4vh] flex items-baseline justify-between gap-3">
                    <span className="truncate text-[clamp(10px,1.25vh,19px)] text-[var(--text-secondary)]">{step.label}</span>
                    <span className="font-data text-[clamp(12px,1.5vh,23px)] font-bold">{step.value}</span>
                  </div>
                  <div className="h-[0.6vh] min-h-[4px] overflow-hidden rounded-[999px] bg-[var(--bg-subtle)]">
                    <div
                      className="h-full rounded-[999px]"
                      style={{ width: `${step.value ? Math.max((step.value / funnelMax) * 100, 4) : 0}%`, background: "var(--blue)" }}
                    />
                  </div>
                </div>
              ))}
              {!funnel.length && <p className="text-[clamp(10px,1.3vh,19px)] text-[var(--text-muted)]">Sem dados de funil.</p>}
            </div>
          </Panel>
        </div>

        <div className="grid min-h-0 grid-rows-2 gap-[0.7vh]">
          <Panel title="Precisa de ação">
            <div className="h-full divide-y divide-[var(--border)]">
              {openQueues.map((queue) => (
                <div key={queue.id} className="flex items-center justify-between gap-3 px-[1vw] py-[0.95vh]">
                  <span className="truncate text-[clamp(11px,1.35vh,21px)] text-[var(--text-secondary)]">{queue.label}</span>
                  <span
                    className="font-data shrink-0 text-[clamp(15px,2vh,32px)] font-bold"
                    style={{ color: queue.severity === "danger" ? "var(--red)" : "var(--amber)" }}
                  >
                    {queue.count}
                  </span>
                </div>
              ))}
              {!openQueues.length && (
                <p className="px-[1vw] py-[1.6vh] text-[clamp(11px,1.35vh,20px)]" style={{ color: "var(--emerald)" }}>
                  Nenhuma pendência aberta.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Agentes no quadro">
            <div className="h-full divide-y divide-[var(--border)] overflow-hidden">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2.5 px-[1vw] py-[0.8vh]">
                  <span
                    className="h-[0.7vh] w-[0.7vh] min-h-[6px] min-w-[6px] shrink-0 rounded-full"
                    style={{ background: agent.enabled ? "var(--emerald)" : "var(--text-muted)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[clamp(11px,1.35vh,21px)] font-bold">{agent.name}</span>
                  <span className="font-data shrink-0 text-[clamp(10px,1.2vh,18px)] text-[var(--text-muted)]">
                    {agent.activeLeads} · {agent.conversations}
                  </span>
                </div>
              ))}
              {!agents.length && (
                <p className="px-[1vw] py-[1.6vh] text-[clamp(11px,1.35vh,20px)] text-[var(--text-muted)]">Nenhum agente cadastrado.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid min-h-0 grid-rows-[1.25fr_1fr] gap-[0.7vh]">
          <Panel title="Últimos movimentos">
            <div className="h-full divide-y divide-[var(--border)] overflow-hidden">
              {events.map((event) => (
                <div key={event.id} className="flex items-center gap-2.5 px-[1vw] py-[0.8vh]">
                  <time className="font-data shrink-0 text-[clamp(10px,1.15vh,17px)] text-[var(--text-muted)]">{event.time}</time>
                  <span
                    className="shrink-0 text-[clamp(9px,1.05vh,15px)] font-bold uppercase"
                    style={{ color: EVENT_TONE[event.type] ?? "var(--text-muted)" }}
                  >
                    {event.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[clamp(10px,1.25vh,19px)] text-[var(--text-secondary)]">{event.label}</span>
                </div>
              ))}
              {!events.length && (
                <p className="px-[1vw] py-[1.6vh] text-[clamp(11px,1.35vh,20px)] text-[var(--text-muted)]">Nenhuma atividade recente.</p>
              )}
            </div>
          </Panel>

          <Panel title="Liturgia de hoje" icon={<BookOpen style={{ width: "clamp(12px,1.35vh,20px)", height: "clamp(12px,1.35vh,20px)" }} />}>
            <div className="h-full px-[1vw] py-[0.9vh]">
              {liturgia?.available ? (
                <>
                  <p className="text-[clamp(10px,1.2vh,18px)] font-bold" style={{ color: "var(--violet)" }}>
                    {liturgia.liturgia}
                  </p>
                  <p className="font-data mt-[0.4vh] text-[clamp(10px,1.15vh,17px)] font-semibold text-[var(--text-muted)]">
                    {liturgia.evangelho?.referencia}
                  </p>
                  <p className="mt-[0.7vh] line-clamp-[5] text-[clamp(10px,1.3vh,20px)] leading-snug text-[var(--text-secondary)]">
                    {liturgia.evangelho?.texto}
                  </p>
                </>
              ) : (
                <p className="text-[clamp(10px,1.3vh,19px)] text-[var(--text-muted)]">
                  {liturgia?.reason ?? "Carregando liturgia do dia…"}
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
