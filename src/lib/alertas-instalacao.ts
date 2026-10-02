import { getHvacStandard } from "@/constants/hvac-standards";

/**
 * Locais da condensadora e alertas de instalação, a partir das respostas
 * fechadas do wizard. Compartilhado entre a tela (alerta na hora, no grupo)
 * e a rota (card de garantia da prancha) — a mesma regra escrita duas vezes
 * diverge.
 */

export type LocalCondensadora = "telhado" | "laje_tecnica" | "sacada_tecnica" | "parede_externa" | "chao";

export const LOCAIS_CONDENSADORA: { rotulo: string; chave: LocalCondensadora }[] = [
  { rotulo: "Telhado", chave: "telhado" },
  { rotulo: "Laje técnica", chave: "laje_tecnica" },
  { rotulo: "Sacada técnica", chave: "sacada_tecnica" },
  { rotulo: "Parede externa (suporte)", chave: "parede_externa" },
  { rotulo: "Chão (base)", chave: "chao" },
];

export function chaveDoLocal(rotulo: string | null | undefined): LocalCondensadora | null {
  return LOCAIS_CONDENSADORA.find((l) => l.rotulo === rotulo)?.chave ?? null;
}

/** O ERP não tem coluna de tensão; ela vem no nome ("... 220V"). Bivolt ou
 *  sem menção devolve `null` — sem dado, sem alerta. */
export function tensaoDoProduto(nome: string | null | undefined): 127 | 220 | null {
  const m = /\b(127|220)\s*v\b/i.exec(nome ?? "");
  return m ? (Number(m[1]) as 127 | 220) : null;
}

export function alertasInstalacao(answers: Record<string, string | undefined>): string[] {
  const regra = getHvacStandard(answers.tipo_equipamento ?? "");
  const alertas: string[] = [];

  const tensaoPonto = answers.tensao === "127 V" ? 127 : answers.tensao === "220 V" ? 220 : null;
  const tensaoAparelho = tensaoDoProduto(answers.modelo);
  if (tensaoPonto && tensaoAparelho && tensaoPonto !== tensaoAparelho) {
    alertas.push(`Tensão do ponto (${tensaoPonto} V) diferente da do aparelho (${tensaoAparelho} V): adequar antes de instalar.`);
  }
  if (answers.tensao === "Não sei") alertas.push("Confirmar a tensão do ponto elétrico antes de instalar.");
  if (answers.obstaculos === "Sim") {
    alertas.push(`Manter afastamento mínimo do aparelho: teto ${regra.cota_teto}, laterais ${regra.cota_lateral}.`);
  }
  if (answers.dreno === "Precisa de bomba de dreno") alertas.push("Instalar bomba de dreno compatível com o aparelho.");
  if (answers.ponto_eletrico === "Não") alertas.push("Executar ponto elétrico exclusivo, com disjuntor dedicado e aterramento.");
  return alertas;
}
