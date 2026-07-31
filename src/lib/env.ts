const clean = (s: string | undefined) => (s ?? "").replace(/[^\x20-\x7E]/g, "").trim();

export const SUPABASE_URL        = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY   = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
export const OPENAI_API_KEY      = clean(process.env.OPENAI_API_KEY);
export const N8N_CHATBOT_WEBHOOK = clean(process.env.N8N_CHATBOT_WEBHOOK);

// Chatwoot Application API (agent-authenticated) — powers /atendimento.
// Optional at boot: reading these here never throws. The Chatwoot client
// (src/lib/chatwoot/client.ts) is responsible for throwing a clear error,
// lazily, only when a request actually needs to reach Chatwoot.
export const CHATWOOT_BASE_URL         = clean(process.env.CHATWOOT_BASE_URL);
export const CHATWOOT_ACCOUNT_ID       = clean(process.env.CHATWOOT_ACCOUNT_ID);
export const CHATWOOT_API_ACCESS_TOKEN = clean(process.env.CHATWOOT_API_ACCESS_TOKEN);
