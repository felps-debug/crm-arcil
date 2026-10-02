import sharp from "sharp";
import { openAI, MODELO_TEXTO } from "./openai";

/**
 * Confere a cena gerada antes de o vendedor ver. Os critérios são os que já
 * deram prévia ruim em produção: ambiente redesenhado, tubulação "colada" por
 * fora em vez de mostrada por dentro, aparelho genérico e letra escrita pelo
 * modelo ("EVAPORADora").
 *
 * Nunca bloqueia: falha da OpenAI devolve `null` e a geração segue.
 */

export type ResultadoInspecao = {
  ambiente_preservado: boolean;
  infra_por_dentro: boolean;
  aparelho_confere: boolean;
  sem_texto: boolean;
  posicao_confere: boolean;
  motivo: string;
};

const CAMPOS_BOOL = ["ambiente_preservado", "infra_por_dentro", "aparelho_confere", "sem_texto", "posicao_confere"] as const;

export function lerInspecao(bruto: string): ResultadoInspecao | null {
  try {
    const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const o = JSON.parse(limpo) as Record<string, unknown>;
    if (!CAMPOS_BOOL.every((c) => typeof o[c] === "boolean")) return null;
    return {
      ambiente_preservado: o.ambiente_preservado as boolean,
      infra_por_dentro: o.infra_por_dentro as boolean,
      aparelho_confere: o.aparelho_confere as boolean,
      sem_texto: o.sem_texto as boolean,
      posicao_confere: o.posicao_confere as boolean,
      motivo: typeof o.motivo === "string" ? o.motivo : "",
    };
  } catch {
    return null;
  }
}

const ehJanela = (tipo: string) => tipo.trim().toLowerCase() === "janela";

/** Posição fora do lugar só avisa: regenerar não garante acertar, e o
 *  vendedor pode preferir a cena mesmo assim. */
export function deveRegenerar(r: ResultadoInspecao, tipo: string): boolean {
  return !r.ambiente_preservado || !r.aparelho_confere || !r.sem_texto || (!ehJanela(tipo) && !r.infra_por_dentro);
}

export function motivoDaInspecao(r: ResultadoInspecao, tipo: string): string | null {
  const falhas: string[] = [];
  if (!r.ambiente_preservado) falhas.push("o ambiente foi alterado");
  if (!ehJanela(tipo) && !r.infra_por_dentro) falhas.push("a infraestrutura não aparece por dentro");
  if (!r.aparelho_confere) falhas.push("o aparelho não confere com o produto");
  if (!r.sem_texto) falhas.push("a IA escreveu texto na cena");
  if (!r.posicao_confere) falhas.push("o aparelho saiu fora da posição marcada");
  if (falhas.length === 0) return null;
  const detalhe = r.motivo.trim() ? ` (${r.motivo.trim()})` : "";
  return `Inspeção automática: ${falhas.join(", ")}${detalhe}. Revise antes de enviar ao cliente.`;
}

async function paraDataUrl(buf: Buffer): Promise<string> {
  const jpeg = await sharp(buf)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function inspecionarCena(args: {
  foto: Buffer;
  cena: Buffer;
  produto: Buffer | null;
  tipo: string;
  tubulacao: string | null;
}): Promise<ResultadoInspecao | null> {
  try {
    const imagens = [
      { type: "text", text: "IMAGEM 1 — foto original do ambiente do cliente:" },
      { type: "image_url", image_url: { url: await paraDataUrl(args.foto), detail: "high" } },
      { type: "text", text: "IMAGEM 2 — cena gerada com o ar-condicionado instalado:" },
      { type: "image_url", image_url: { url: await paraDataUrl(args.cena), detail: "high" } },
      ...(args.produto
        ? [
            { type: "text", text: "IMAGEM 3 — foto de catálogo do aparelho escolhido:" },
            { type: "image_url", image_url: { url: await paraDataUrl(args.produto), detail: "low" } },
          ]
        : []),
    ];
    const raw = await openAI({
      model: MODELO_TEXTO,
      messages: [
        {
          role: "user",
          content: [
            ...imagens,
            {
              type: "text",
              text:
                `Você é o controle de qualidade de prévias de instalação de ar-condicionado (${args.tipo}` +
                `${args.tubulacao ? `, tubulação: ${args.tubulacao}` : ""}). Compare as imagens e responda APENAS um JSON válido, sem markdown:\n` +
                '{"ambiente_preservado": bool, "infra_por_dentro": bool, "aparelho_confere": bool, "sem_texto": bool, "posicao_confere": bool, "motivo": "frase curta em português"}\n' +
                "- ambiente_preservado: móveis, janelas, portas, cores e enquadramento da IMAGEM 2 são os da IMAGEM 1 (só o aparelho e a infraestrutura foram acrescentados).\n" +
                "- infra_por_dentro: tubulação/dreno/cabo aparecem por dentro da canaleta, da parede ou do forro em efeito raio-x translúcido (ou aparentes com abraçadeiras, se a tubulação for 'Sem canaleta').\n" +
                "- aparelho_confere: o aparelho da IMAGEM 2 tem o formato e o acabamento do da IMAGEM 3 (true se não houver IMAGEM 3).\n" +
                "- sem_texto: a IMAGEM 2 não tem nenhuma letra, número, legenda ou marca d'água desenhados pela IA.\n" +
                "- posicao_confere: o aparelho está num lugar plausível da parede/forro, sem flutuar nem atravessar objetos.",
            },
          ],
        },
      ],
      max_tokens: 300,
    });
    return lerInspecao(raw);
  } catch (err) {
    console.error("[inspetor-cena] falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}
