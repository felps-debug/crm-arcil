const clean = (s: string | undefined) => (s ?? "").replace(/[^\x20-\x7E]/g, "").trim();

export const SUPABASE_URL        = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY   = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
export const OPENAI_API_KEY      = clean(process.env.OPENAI_API_KEY);
export const N8N_CHATBOT_WEBHOOK = clean(process.env.N8N_CHATBOT_WEBHOOK);
