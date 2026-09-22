/**
 * Último estado válido de cada tela, em memória da aba.
 *
 * Voltar a uma tela visitada mostra na hora o que já estava lá e atualiza em
 * segundo plano, em vez de repetir o skeleton e a carga inteira (RF-012).
 *
 * Só memória, de propósito: leads e cobranças têm nome, telefone e valor devido,
 * e nada disso pode ficar gravado no navegador depois que a aba fecha ou o
 * usuário sai. Recarregar a página começa do zero (clarificação Q1 da spec).
 */

export const FRESH_MS = 30_000;

export type CacheView<T = unknown> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Tem dado na tela, mas a última atualização falhou. */
  isStale: boolean;
  fetchedAt: number | null;
};

type Fetcher<T> = () => Promise<T>;

type Entry = {
  data: unknown;
  hasData: boolean;
  fetchedAt: number | null;
  error: string | null;
  invalidated: boolean;
  /** Sequência da última request disparada. */
  seq: number;
  /** Sequência da última resposta aceita — resposta com número menor é descartada. */
  acceptedSeq: number;
  inflight: Promise<void> | null;
  inflightCount: number;
  fetcher: Fetcher<unknown> | null;
  subscribers: Set<() => void>;
  view: CacheView;
};

const store = new Map<string, Entry>();

const EMPTY_VIEW: CacheView = { data: null, loading: false, error: null, isStale: false, fetchedAt: null };

/** `_r` só existia para forçar refetch trocando a URL; não faz parte da identidade do dado. */
export function cacheKey(url: string) {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.delete("_r");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

function entryFor(key: string): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = {
      data: null,
      hasData: false,
      fetchedAt: null,
      error: null,
      invalidated: false,
      seq: 0,
      acceptedSeq: 0,
      inflight: null,
      inflightCount: 0,
      fetcher: null,
      subscribers: new Set(),
      view: EMPTY_VIEW,
    };
    store.set(key, entry);
  }
  return entry;
}

/** Troca o objeto de view (imutável, para useSyncExternalStore) e avisa quem assina. */
function publish(entry: Entry) {
  entry.view = {
    data: entry.hasData ? entry.data : null,
    loading: entry.inflightCount > 0,
    error: entry.error,
    isStale: entry.hasData && entry.error !== null,
    fetchedAt: entry.fetchedAt,
  };
  for (const cb of entry.subscribers) cb();
}

export function getView<T = unknown>(key: string): CacheView<T> {
  return (store.get(key)?.view ?? EMPTY_VIEW) as CacheView<T>;
}

export function subscribe(key: string, cb: () => void) {
  const entry = entryFor(key);
  entry.subscribers.add(cb);
  return () => {
    entry.subscribers.delete(cb);
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao carregar dados";
}

/**
 * Garante que a chave tenha dado recente.
 *
 * - fresco (< freshMs) e não invalidado: não faz nada
 * - já existe request em voo: espera a mesma
 * - `force`: dispara outra mesmo com uma em voo; a mais nova vence
 */
export function load<T>(
  key: string,
  fetcher: Fetcher<T>,
  opts: { freshMs?: number; force?: boolean } = {}
): Promise<void> {
  const entry = entryFor(key);
  entry.fetcher = fetcher as Fetcher<unknown>;
  const freshMs = opts.freshMs ?? FRESH_MS;

  const fresh = entry.hasData && !entry.invalidated && entry.fetchedAt !== null && Date.now() - entry.fetchedAt < freshMs;
  if (!opts.force && fresh) return Promise.resolve();
  if (!opts.force && entry.inflight) return entry.inflight;

  const seq = ++entry.seq;
  entry.inflightCount += 1;
  publish(entry);

  const run = fetcher()
    .then((data) => {
      if (seq < entry.acceptedSeq) return;
      entry.acceptedSeq = seq;
      entry.data = data;
      entry.hasData = true;
      entry.fetchedAt = Date.now();
      entry.error = null;
      entry.invalidated = false;
    })
    .catch((error) => {
      if (seq < entry.acceptedSeq) return;
      entry.acceptedSeq = seq;
      entry.error = errorMessage(error);
    })
    .finally(() => {
      entry.inflightCount -= 1;
      if (entry.inflight === run) entry.inflight = null;
      publish(entry);
    });

  entry.inflight = run;
  return run;
}

/**
 * Marca como velho. Quem está na tela revalida agora; quem não está, na
 * próxima visita. É o que o realtime chama quando uma tabela muda.
 */
export function invalidate(match: string | ((key: string) => boolean)) {
  const test = typeof match === "string" ? (key: string) => key.startsWith(match) : match;
  for (const [key, entry] of store) {
    if (!test(key)) continue;
    entry.invalidated = true;
    if (entry.subscribers.size && entry.fetcher) void load(key, entry.fetcher, { force: true });
  }
}

/** Logout: nada do usuário anterior pode sobrar para o próximo. */
export function clearApiCache() {
  const subscribers = [...store.values()].flatMap((entry) => [...entry.subscribers]);
  store.clear();
  for (const cb of subscribers) cb();
}
