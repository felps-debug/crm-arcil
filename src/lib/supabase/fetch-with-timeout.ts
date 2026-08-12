const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;

/** Impede que uma conexão externa deixe uma rota do CRM pendurada indefinidamente. */
export function fetchWithSupabaseTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);

  return fetch(input, { ...init, signal });
}
