import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// In-memory sliding-window limiter, scoped to the handful of routes that are
// either unauthenticated (check-result) or trigger paid/real-world side effects
// (OpenAI calls, WhatsApp dispatch via cobranca or Chatwoot). Good enough as a
// first line of defense for a single-instance deploy; swap for Upstash
// Ratelimit if traffic grows across multiple serverless instances (state here
// doesn't share across them).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = {
  "/api/check-result": 20,
  "/api/chat": 30,
  "/api/generate-image": 10,
  "/api/cobranca/disparo": 5,
  "/api/cobranca/reenviar-nao-disparados": 5,
  // Grava em performance_traces a cada abertura de tela; o teto só impede que
  // alguém encha a tabela.
  "/api/perf/traces": 60,
};
// Dynamic route — sends a real WhatsApp message via Chatwoot, same category as cobranca/disparo.
const SEND_MESSAGE_RE = /^\/api\/atendimento\/conversations\/[^/]+\/messages$/;
const SEND_MESSAGE_LIMIT = 20;

const rateLimitHits = new Map<string, number[]>();

function isRateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const timestamps = (rateLimitHits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  rateLimitHits.set(key, timestamps);
  return timestamps.length > limit;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const rateLimit = RATE_LIMITS[path] ?? (SEND_MESSAGE_RE.test(path) ? SEND_MESSAGE_LIMIT : null);
  if (rateLimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(`${path}:${ip}`, rateLimit)) {
      return NextResponse.json({ error: "Muitas requisições — tente novamente em instantes." }, { status: 429 });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verificação local da assinatura ES256 do JWT (JWKS em cache) — sem ida ao
  // Auth server, e diferente de getSession() não aceita cookie adulterado.
  // Também renova o token quando ele expira, gravando o cookie novo via setAll.
  // Autorização (papel, permissão) continua nas rotas: aqui só decide login.
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const session = Boolean(data?.claims?.sub);

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!session && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    // DIAGNÓSTICO TEMPORÁRIO (preview da feature 001): motivo da recusa, sem
    // token nem dado de usuário. Remover antes do merge.
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.includes("-auth-token"));
    redirect.headers.set(
      "x-auth-diag",
      `cookie=${hasAuthCookie} ${claimsError ? `${claimsError.name}:${claimsError.message}`.replace(/[^\x20-\x7E]/g, "").slice(0, 160) : "no-error"}`
    );
    return redirect;
  }

  if (session && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
