/**
 * O PostgREST corta toda resposta em 1.000 linhas e não avisa — a lista só
 * chega menor. Qualquer tabela que possa passar disso tem que ser lida por
 * página, senão a contagem sai errada sem erro nenhum (RF-007).
 */
export const PAGE_SIZE = 1000;

/**
 * Teto de segurança: uma tabela operacional com mais que isso não deveria ser
 * trazida inteira para agregar em memória — é hora de agregar no banco. Passar
 * do teto é erro, nunca corte silencioso.
 */
export const MAX_ROWS = 20_000;

export class RowLimitExceededError extends Error {
  constructor(limit: number) {
    super(`Consulta passou de ${limit} linhas; agregue no banco em vez de trazer tudo.`);
    this.name = "RowLimitExceededError";
  }
}

export async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (rows.length > MAX_ROWS) throw new RowLimitExceededError(MAX_ROWS);
    if (page.length < PAGE_SIZE) return rows;
  }
}
