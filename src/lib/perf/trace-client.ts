"use client";

/**
 * Marcas de tempo do lado do browser, com o mesmo trace_id que o servidor usa
 * (header x-trace-id). Juntas em performance_traces dizem se o tempo de uma
 * tela lenta foi rede, servidor ou renderização.
 *
 * Só números e o id da jornada saem daqui — nada da tela, nada do usuário.
 */

type Journey = "dashboard" | "leads" | "login" | "other";
type LoadKind = "cold" | "warm";
type Stage = { stage: "ttfb" | "ready" | "hydrated" | "revalidated"; durationMs: number; outcome: "ok" | "error" | "timeout" };

export type BrowserJourney = {
  traceId: string;
  mark: (stage: Stage["stage"], durationMs: number, outcome?: Stage["outcome"]) => void;
  flush: () => void;
};

export function startJourney(journey: Journey, loadKind: LoadKind, traceId = crypto.randomUUID()): BrowserJourney {
  const stages: Stage[] = [];
  let sent = false;

  return {
    traceId,
    mark(stage, durationMs, outcome = "ok") {
      if (!sent && Number.isFinite(durationMs) && durationMs >= 0) stages.push({ stage, durationMs, outcome });
    },
    flush() {
      if (sent || !stages.length) return;
      sent = true;
      const body = JSON.stringify({ traceId, journey, loadKind, stages });
      // sendBeacon sobrevive à troca de página; fetch keepalive é o plano B.
      // Falha aqui nunca aparece para o usuário — medir não pode atrapalhar.
      try {
        const queued = navigator.sendBeacon?.("/api/perf/traces", new Blob([body], { type: "application/json" }));
        if (!queued) {
          void fetch("/api/perf/traces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // sem traço desta vez
      }
    },
  };
}

/** Rota em que a aba foi aberta (carga completa do documento), não a atual. */
export function navigationPath(): string | null {
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (!nav) return null;
  try {
    return new URL(nav.name).pathname;
  } catch {
    return null;
  }
}

/** Primeiro byte da navegação atual, se a tela foi aberta por carga completa. */
export function navigationTtfb(): number | null {
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return nav ? Math.round(nav.responseStart) : null;
}
