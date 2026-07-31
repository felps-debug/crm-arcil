import * as Sentry from "@sentry/nextjs";

/**
 * Sentry initialization for the browser.
 *
 * Uses NEXT_PUBLIC_SENTRY_DSN rather than SENTRY_DSN: only
 * NEXT_PUBLIC_-prefixed env vars are inlined into the client bundle by
 * Next.js, so a server-only SENTRY_DSN would never reach this file. Both
 * are optional — this project doesn't have a Sentry account/DSN yet, and
 * with the env var unset, `dsn` is undefined and `enabled` is false, so
 * the SDK stays fully inert in the browser too: no requests, no captured
 * events, nothing thrown.
 *
 * Wrapped in try/catch so a failure here (e.g. a malformed DSN) can never
 * break page load or hydration.
 */
try {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0.1,
  });
} catch (err) {
  console.error(
    "[sentry] client init failed — continuing without error tracking",
    err
  );
}

/**
 * Instruments App Router client-side navigations for performance
 * tracing. No-ops along with the rest of the SDK when Sentry isn't
 * initialized with a DSN.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
