import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Boots the actual Next.js dev server for the smoke test. Requires
  // NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (public-safe, not secrets) — proxy.ts
  // runs on every request, including /login, and 500s without them before
  // any page renders. Set in CI via .github/workflows/ci.yml's job env.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
