/**
 * lib/env.ts is imported by both server and client code (client.ts needs
 * NEXT_PUBLIC_SUPABASE_URL/ANON_KEY), so it can't throw at module scope —
 * that would crash the browser bundle too, since unrelated server-only vars
 * always read as undefined there. Server-only routes call this instead, at
 * request time, to fail fast with a clear message rather than a mysterious
 * downstream 401/500 from OpenAI/n8n.
 */
export function assertEnv(name: string, value: string): string {
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}
