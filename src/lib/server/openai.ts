import { OPENAI_API_KEY } from "@/lib/env";

/** Modelo usado em todas as chamadas de texto e visão do gerador.
 *
 *  gpt-5.1 custa metade do gpt-4o na entrada (US$ 1,25 contra US$ 2,50 por
 *  milhão), e entrada é o grosso do gasto aqui — a análise da foto sozinha
 *  manda quase mil tokens de imagem. */
export const MODELO_TEXTO = "gpt-5.1";

export async function openAI(body: object) {
  // A família gpt-5 recusa `max_tokens` e exige `max_completion_tokens`. Como
  // as chamadas desta rota nasceram no gpt-4o, a tradução fica aqui em vez de
  // em cada chamada — trocar o modelo não pode obrigar a revisar cinco lugares.
  const corpo = body as Record<string, unknown>;
  if (typeof corpo.model === "string" && corpo.model.startsWith("gpt-5") && "max_tokens" in corpo) {
    const { max_tokens, ...resto } = corpo;
    body = { ...resto, max_completion_tokens: max_tokens };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // "OpenAI error" sem corpo custou uma rodada de investigação inteira pra
    // achar que era "Error while downloading file" (imagem ainda não
    // propagada no Storage) — o status/corpo real vai no log a partir daqui.
    const corpo = await res.text().catch(() => "");
    throw new Error(`OpenAI error (HTTP ${res.status}): ${corpo.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}
