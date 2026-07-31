import * as Sentry from "@sentry/nextjs";

/**
 * Sentry initialization for the Edge runtime (proxy.ts, edge API routes).
 *
 * Same undefined-safe contract as sentry.server.config.ts: SENTRY_DSN is
 * optional, and with it unset the SDK is fully inert — never throws,
 * never sends anything. Set SENTRY_DSN once a Sentry project exists.
 */
try {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: Boolean(process.env.SENTRY_DSN),
    tracesSampleRate: 0.1,
  });
} catch (err) {
  console.error(
    "[sentry] edge init failed — continuing without error tracking",
    err
  );
}
