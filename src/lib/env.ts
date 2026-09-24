const clean = (s: string | undefined) => (s ?? "").replace(/[^\x20-\x7E]/g, "").trim();

export const SUPABASE_URL        = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY   = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
export const OPENAI_API_KEY      = clean(process.env.OPENAI_API_KEY);
export const N8N_CHATBOT_WEBHOOK = clean(process.env.N8N_CHATBOT_WEBHOOK);
export const N8N_CONDENSADORA_WEBHOOK = clean(process.env.N8N_CONDENSADORA_WEBHOOK);
export const N8N_FINANCIAL_HANDOFF_WEBHOOK = clean(process.env.N8N_FINANCIAL_HANDOFF_WEBHOOK);
export const N8N_FINANCIAL_HANDOFF_SECRET = clean(process.env.N8N_FINANCIAL_HANDOFF_SECRET);

// Chatwoot Application API (agent-authenticated) — powers /atendimento.
// Optional at boot: reading these here never throws. The Chatwoot client
// (src/lib/chatwoot/client.ts) is responsible for throwing a clear error,
// lazily, only when a request actually needs to reach Chatwoot.
export const CHATWOOT_BASE_URL         = clean(process.env.CHATWOOT_BASE_URL);
export const CHATWOOT_ACCOUNT_ID       = clean(process.env.CHATWOOT_ACCOUNT_ID);
export const CHATWOOT_API_ACCESS_TOKEN = clean(process.env.CHATWOOT_API_ACCESS_TOKEN);

/**
 * Feature flags do gerador de imagem V2.
 *
 * A V2 entra por família de equipamento, uma de cada vez, com a V1 intacta ao
 * lado: enquanto uma família não estiver validada, ela continua saindo pelo
 * layout antigo. Ligar por variável de ambiente permite comparar as duas na
 * mesma cena sem redeploy.
 */
export const V2_CASSETTE_LAYOUT = clean(process.env.V2_CASSETTE_LAYOUT) === "1";

/**
 * Quem desenha o quê na prévia (ver `ModoInfra` em lib/server/previa-tipos.ts).
 *
 * `modelo_3d` (padrão): o modelo de imagem (Seedream, via n8n) desenha a cena
 * com a tubulação e a canaleta em 3D e SEM nenhum texto; o CRM escreve
 * legendas, cotas e fluxo de ar como vetor — modelo de imagem erra letra.
 *
 * `gemini_3d`: legado — o modelo desenha tubulação e legendas.
 *
 * `vetorial`: o CRM desenha também o feixe de quatro cores por cima da foto.
 * Determinístico, mas chapado — rollback via `INFRA_VISUAL=vetorial`.
 */
export const INFRA_VISUAL: "modelo_3d" | "gemini_3d" | "vetorial" = ((v) =>
  v === "vetorial" || v === "gemini_3d" ? v : "modelo_3d")(clean(process.env.INFRA_VISUAL));

/**
 * Onde e qual build respondeu — gravados em performance_traces para confirmar
 * que as funções rodam em gru1 (vercel.json) e comparar deploys. A Vercel
 * preenche as duas sozinha; fora dela ficam como "local".
 */
export const VERCEL_REGION = clean(process.env.VERCEL_REGION) || "local";
export const VERCEL_GIT_COMMIT_SHA = clean(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 7) || "local";
