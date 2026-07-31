import * as Sentry from "@sentry/nextjs";

/**
 * Sentry initialization for the Node.js server runtime.
 *
 * SENTRY_DSN is intentionally optional — this project doesn't have a
 * Sentry account/DSN yet. When the env var is unset, `dsn` is undefined
 * and `enabled` is false, so the SDK stays completely inert: no network
 * calls, no captured events, nothing thrown. Once a DSN exists, just set
 * SENTRY_DSN in the environment — no code change required here.
 *
 * The whole call is wrapped in try/catch as a belt-and-suspenders
 * guarantee that observability tooling can never crash the app, even in
 * unforeseen edge cases (e.g. a malformed DSN string).
 */
try {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: Boolean(process.env.SENTRY_DSN),

    // Low sample rate — keep overhead small until we have real traffic
    // patterns to tune against.
    tracesSampleRate: 0.1,
  });
} catch (err) {
  console.error(
    "[sentry] server init failed — continuing without error tracking",
    err
  );
}
