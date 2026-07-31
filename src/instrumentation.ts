import * as Sentry from "@sentry/nextjs";

/**
 * Registers Sentry for whichever server runtime Next.js is currently
 * running (Node.js or Edge). Called once per server instance, before it
 * starts handling requests.
 *
 * Safe with no Sentry account/DSN configured: sentry.server.config.ts and
 * sentry.edge.config.ts are themselves undefined-DSN-safe (see comments
 * there), and this function is wrapped in try/catch so a failure to load
 * observability tooling can never prevent the server from starting.
 */
export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await import("./sentry.server.config");
    }

    if (process.env.NEXT_RUNTIME === "edge") {
      await import("./sentry.edge.config");
    }
  } catch (err) {
    console.error(
      "[sentry] instrumentation register() failed — continuing without it",
      err
    );
  }
}

/**
 * Forwards uncaught server-side errors (Server Components, Route
 * Handlers, Server Actions) to Sentry. This is how API routes and other
 * server code get automatic error tracking without any manual
 * `Sentry.captureException` calls sprinkled through the codebase (see
 * AGENTS.md — src/lib/server/api-auth.ts is owned by concurrent work and
 * intentionally left untouched).
 *
 * `Sentry.captureRequestError` is a no-op when Sentry hasn't been
 * initialized with a DSN — Sentry's capture functions are designed to
 * swallow their own internal failures rather than throw, so this stays
 * safe with SENTRY_DSN unset.
 */
export const onRequestError = Sentry.captureRequestError;
