import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Medição de performance roda contra um deploy de preview (PERF_BASE_URL),
// nunca contra o dev server local — o número que importa é o da Vercel em gru1.
// Ver specs/001-otimizar-performance-crm/quickstart.md.
const PERF_BASE_URL = process.env.PERF_BASE_URL;

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
      testIgnore: /perf\//,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "perf",
      testMatch: /perf\/.*\.perf\.ts$/,
      // Carga fria só vale se as 30 rodadas forem em sequência: em paralelo
      // elas disputam a mesma função serverless e o p95 mede fila, não a tela.
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], baseURL: PERF_BASE_URL },
    },
  ],
  // Boots the actual Next.js dev server for the smoke test. Requires
  // NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (public-safe, not secrets) — proxy.ts
  // runs on every request, including /login, and 500s without them before
  // any page renders. Set in CI via .github/workflows/ci.yml's job env.
  webServer: PERF_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
