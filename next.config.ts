import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
};

// Wraps the config above with Sentry's build-time integration (source map
// upload, tunneling, etc). All existing config is passed through
// untouched — withSentryConfig only adds to the build pipeline.
//
// No Sentry account/DSN exists for this project yet, so org/project/
// authToken are all left as optional env vars. Without them set, the
// Sentry build plugin just skips source map upload (logging a notice,
// never failing the build) — see Sentry Next.js docs.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print Sentry's own build logs in CI; keep local dev/build quiet.
  silent: !process.env.CI,
});
