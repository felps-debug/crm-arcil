/**
 * Regra única de "follow-up pendente".
 *
 * Toda linha de `followups` nasce junto com o lead, com `followup_step` 0 e
 * `followup_sent` false: é entrada de fila, não pendência. Só uma linha que foi
 * de fato disparada e ficou sem resposta representa alguém esperando.
 *
 * Esta regra já esteve escrita em quatro lugares e só um deles exigia
 * `followup_sent`. O painel passou a se contradizer: a Agenda operacional dizia
 * "0 fora do prazo" enquanto o banner, o card e o badge da sidebar diziam 13 --
 * treze leads de cobrança cadastrados em agosto cuja régua nunca chegou a
 * disparar. Quem seguisse o aviso ia procurar uma fila que não existe.
 *
 * Antes deste módulo o contador já tinha sido remendado duas vezes (91ef45e
 * adicionou `status = PENDING`; b890841 tirou o mesmo ruído de lead-de-cobrança
 * do feed de atividade). Manter a regra aqui evita o quarto remendo.
 *
 * A janela de atraso NÃO mora aqui de propósito: cada chamador usa a sua
 * (o banner olha `updated_at` em 48h, a fila olha `created_at` em 24h).
 */

/** Único status que a régua considera em aberto; o outro valor em uso é ENCERRADO. */
export const STATUS_PENDENTE = "PENDING";

/** O mínimo que uma linha precisa expor pra ser avaliada, venha do banco ou da memória. */
export type FollowupAvaliavel = {
  followup_sent?: boolean | null;
  respondeu?: boolean | null;
  status?: string | null;
};

/**
 * Alguém está realmente esperando retorno deste follow-up?
 *
 * `respondeu !== true` em vez de `=== false` porque a coluna é nullable: uma
 * linha sem resposta registrada conta como não respondida, não como respondida.
 */
export function isFollowupPendente(followup: FollowupAvaliavel): boolean {
  return (
    followup.followup_sent === true &&
    followup.respondeu !== true &&
    followup.status === STATUS_PENDENTE
  );
}

/**
 * A mesma regra, aplicada no banco em vez de em memória.
 *
 * Usa `respondeu is not true` (e não `eq false`) para casar exatamente com o
 * `respondeu !== true` acima -- `eq(false)` descartaria linha com NULL, e aí as
 * duas versões voltariam a divergir, que é o defeito que este módulo existe
 * para fechar.
 */
type QueryFiltravel = {
  eq(coluna: string, valor: unknown): QueryFiltravel;
  not(coluna: string, operador: string, valor: unknown): QueryFiltravel;
};

export function filtrarPendentes<Q>(query: Q): Q {
  const q = query as unknown as QueryFiltravel;
  return q
    .eq("followup_sent", true)
    .eq("status", STATUS_PENDENTE)
    .not("respondeu", "is", true) as unknown as Q;
}
