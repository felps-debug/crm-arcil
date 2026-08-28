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
 * Quem desenha a infraestrutura na cena.
 *
 * `vetorial` (padrão atual): o CRM desenha o feixe de quatro cores e a faixa de
 * plenum por cima da foto. Determinístico, mas chapado.
 *
 * `gemini_3d`: o modelo de imagem desenha a tubulação e a canaleta em 3D,
 * semitransparentes, saindo do aparelho na direção da condensadora. Fica muito
 * mais realista — e obriga o CRM a NÃO desenhar o feixe, senão as duas
 * representações se sobrepõem, que é o erro documentado deste projeto.
 *
 * Texto, cota e card continuam vetoriais nos dois modos.
 */
export const INFRA_VISUAL = clean(process.env.INFRA_VISUAL) === "gemini_3d" ? "gemini_3d" : "vetorial";
