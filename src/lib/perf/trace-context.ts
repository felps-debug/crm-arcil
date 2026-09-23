import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Cronômetro por request, sem passar nada de mão em mão.
 *
 * `withTrace` abre um contexto (AsyncLocalStorage) que acompanha a request por
 * todos os awaits; `timeStage` e `countSupabaseRequest` escrevem nele de onde
 * estiverem — do api-auth, do snapshot, do fetch do Supabase. No fim a rota
 * lê as etapas para o header Server-Timing e grava em performance_traces.
 */

export type StageOutcome = "ok" | "error" | "forbidden" | "timeout";
export type TraceStage = { stage: string; durationMs: number; outcome: StageOutcome };

type TraceStore = { traceId: string; stages: TraceStage[]; supabaseRequests: number };

const storage = new AsyncLocalStorage<TraceStore>();

export function withTrace<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ traceId, stages: [], supabaseRequests: 0 }, fn);
}

export function currentTrace(): Readonly<TraceStore> | undefined {
  return storage.getStore();
}

export async function timeStage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let outcome: StageOutcome = "ok";
  try {
    return await fn();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    storage.getStore()?.stages.push({ stage, durationMs: Math.round(performance.now() - started), outcome });
  }
}

/** Chamado pelo fetch dos clients Supabase do servidor (lib/supabase/fetch-with-timeout.ts). */
export function countSupabaseRequest() {
  const store = storage.getStore();
  if (store) store.supabaseRequests += 1;
}
