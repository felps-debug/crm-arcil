import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Medição de aceite do dashboard (RF-022, CS-001, CS-002).
 *
 * Carga fria: contexto de navegador novo a cada rodada — sem cache HTTP nem
 * estado de cliente — com a sessão já válida. A função serverless pode estar
 * quente; esperar ela esfriar não é o que o usuário vive (clarificação Q3).
 * Carga quente: ir a /leads e voltar ao dashboard na mesma aba.
 *
 * Roda só com PERF_BASE_URL (preview da Vercel), nunca contra o dev server:
 *   PERF_BASE_URL=https://... PERF_LABEL=baseline npx playwright test --project=perf
 *
 * Login: PERF_USER_EMAIL/PERF_USER_PASSWORD, ou PERF_STORAGE_STATE apontando
 * para um storageState salvo à mão (caso o login automático não passe).
 */

const RUNS = Number(process.env.PERF_RUNS ?? 30);
const LABEL = process.env.PERF_LABEL ?? "run";
const OUT_DIR = path.resolve("perf-results");
const STATE_FILE = process.env.PERF_STORAGE_STATE ?? path.join(OUT_DIR, ".auth-state.json");

// O dashboard marca data-dashboard-ready quando resumo e pendências resolveram.
// Antes dessa marca existir (linha de base no master atual), o primeiro card
// de métrica visível é o sinal mais próximo de "tela utilizável".
const READY_MARKER = '[data-dashboard-ready="true"]';
const FALLBACK_MARKER = "text=Total leads";

type Marker = "ready" | "fallback";

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function waitUsable(page: Page): Promise<Marker> {
  const ready = page.locator(READY_MARKER);
  const fallback = page.locator(FALLBACK_MARKER).first();
  const winner = await Promise.race([
    ready.waitFor({ state: "attached", timeout: 30_000 }).then(() => "ready" as const),
    // Só vale o fallback se a página nem tem o atributo — com o atributo em
    // "false" a tela ainda não está pronta, mesmo com o card já pintado.
    fallback.waitFor({ state: "visible", timeout: 30_000 }).then(async () => {
      const hasAttr = await page.locator("[data-dashboard-ready]").count();
      if (hasAttr) {
        await ready.waitFor({ state: "attached", timeout: 30_000 });
        return "ready" as const;
      }
      return "fallback" as const;
    }),
  ]);
  return winner;
}

async function ensureLoggedIn(browser: Browser) {
  if (existsSync(STATE_FILE) && process.env.PERF_STORAGE_STATE) return;

  const email = process.env.PERF_USER_EMAIL;
  const password = process.env.PERF_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("Defina PERF_USER_EMAIL/PERF_USER_PASSWORD ou PERF_STORAGE_STATE.");
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  mkdirSync(OUT_DIR, { recursive: true });
  await context.storageState({ path: STATE_FILE });
  await context.close();
}

test("dashboard: cargas frias e quentes", async ({ browser, baseURL }) => {
  test.skip(!process.env.PERF_BASE_URL, "PERF_BASE_URL não definida — medição só roda contra preview.");
  test.setTimeout(15 * 60_000);

  await ensureLoggedIn(browser);

  const cold: number[] = [];
  const warm: number[] = [];
  const markers = new Set<Marker>();

  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();
    const started = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    markers.add(await waitUsable(page));
    cold.push(Date.now() - started);
    await context.close();
  }

  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();
  await page.goto("/");
  await waitUsable(page);
  for (let i = 0; i < RUNS; i++) {
    await page.locator('a[href="/leads"]').first().click();
    await page.waitForURL("**/leads");
    const started = Date.now();
    await page.locator('a[href="/"]').first().click();
    await page.waitForURL((url) => url.pathname === "/");
    markers.add(await waitUsable(page));
    warm.push(Date.now() - started);
  }
  await context.close();

  const result = {
    label: LABEL,
    baseURL,
    measuredAt: new Date().toISOString(),
    runs: RUNS,
    marker: markers.has("fallback") ? "fallback" : "ready",
    cold: { samples: cold, p50: percentile(cold, 50), p95: percentile(cold, 95) },
    warm: { samples: warm, p50: percentile(warm, 50), p95: percentile(warm, 95) },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${LABEL}-${result.measuredAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.info(`[perf] ${file}\n  cold p50=${result.cold.p50} p95=${result.cold.p95}\n  warm p50=${result.warm.p50} p95=${result.warm.p95}`);

  expect(cold).toHaveLength(RUNS);
});
