/* Limpeza dos textos que o vendedor digita antes de irem para a prévia.
   A prévia junta resposta livre com pontuação própria ("Ao lado na sacada.") e
   saía "sacada.." e "sacada. · nível". */

/** Tira pontuação e espaço do fim, para quem compõe a frase pôr a sua. */
export function semPontoFinal(texto: string): string {
  return texto.trim().replace(/[\s.;,:·-]+$/u, "");
}

/**
 * Nome do produto com a marca uma vez só, na frente.
 *
 * O nome de catálogo do ERP às vezes já traz a marca no meio
 * ("SPLIT HI WALL 12000 FRIO PHILCO INVERTER"), e prefixar a marca dava
 * "PHILCO SPLIT … PHILCO INVERTER" no card MODELO.
 */
export function nomeComMarca(produto: string, marca: string | null | undefined): string {
  const nome = produto.trim().replace(/\s+/g, " ");
  const m = (marca ?? "").trim();
  if (!m) return nome;
  const escapada = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const semMarca = nome.replace(new RegExp(`(^|\\s)${escapada}(?=\\s|$)`, "gi"), " ").replace(/\s+/g, " ").trim();
  return semMarca ? `${m} ${semMarca}` : m;
}
