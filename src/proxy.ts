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

  // Optimistic session check from cookie — no network call to Supabase auth server.
  // Full JWT verification happens in API routes and server actions as needed.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!session && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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
