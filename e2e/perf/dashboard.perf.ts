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
const FALLBACK_TEXT = "Atendimentos do agente";
const ERROR_TEXT = "demorou mais que 15 segundos";
const USABLE_TIMEOUT_MS = 30_000;

type Marker = "ready" | "fallback" | "error" | "timeout";

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Uma espera só, avaliada no browser: pronto quando o marcador existe e está
 * "true"; sem marcador na página (versão antiga), quando o card aparece.
 * Duas esperas em corrida deixavam a perdedora pendurada, e ela estourava o
 * timeout no meio da rodada seguinte.
 */
async function waitUsable(page: Page): Promise<Marker> {
  try {
    const handle = await page.waitForFunction(
      ({ fallbackText, errorText }) => {
        // Só o que está visível: com cacheComponents o Next 16 mantém a tela
        // anterior montada e escondida (<Activity>), e o texto dela "já estaria
        // lá" antes de a tela nova existir.
        const visible = (el: Element) => el.checkVisibility();
        const leaves = () =>
          [...document.querySelectorAll("p, span, div")].filter((el) => el.childElementCount === 0 && visible(el));
        // A versão antiga desiste depois de 15 s e troca a tela por um erro:
        // para quem está usando, isso é uma carga que falhou, não um "pronto".
        if (leaves().some((el) => el.textContent?.includes(errorText))) return "error";
        // O marcador é um <div hidden>; o que conta é o container dele estar visível.
        const marker = [...document.querySelectorAll("[data-dashboard-ready]")].find(
          (el) => el.parentElement && visible(el.parentElement)
        );
        if (marker) return marker.getAttribute("data-dashboard-ready") === "true" ? "ready" : false;
        return leaves().some((el) => el.textContent?.trim() === fallbackText) ? "fallback" : false;
      },
      { fallbackText: FALLBACK_TEXT, errorText: ERROR_TEXT },
      { timeout: USABLE_TIMEOUT_MS, polling: 50 }
    );
    return (await handle.jsonValue()) as Marker;
  } catch {
    return "timeout";
  }
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
  const outcomes = { cold: {} as Record<Marker, number>, warm: {} as Record<Marker, number> };
  const count = (kind: "cold" | "warm", m: Marker) => (outcomes[kind][m] = (outcomes[kind][m] ?? 0) + 1);

  // Carga que falhou ou estourou entra na amostra com o tempo que levou até
  // falhar: tirar ela deixaria o p95 bonito justamente onde a tela quebrou.
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();
    const started = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    count("cold", await waitUsable(page));
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
    count("warm", await waitUsable(page));
    warm.push(Date.now() - started);
  }
  await context.close();

  const markerOf = (o: Record<string, number>) => (o.fallback ? "fallback" : "ready");
  const result = {
    label: LABEL,
    baseURL,
    measuredAt: new Date().toISOString(),
    runs: RUNS,
    marker: markerOf({ ...outcomes.cold, ...outcomes.warm }),
    outcomes,
    cold: { samples: cold, p50: percentile(cold, 50), p95: percentile(cold, 95) },
    warm: { samples: warm, p50: percentile(warm, 50), p95: percentile(warm, 95) },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${LABEL}-${result.measuredAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.info(
    `[perf] ${file}\n` +
      `  cold p50=${result.cold.p50} p95=${result.cold.p95} ${JSON.stringify(outcomes.cold)}\n` +
      `  warm p50=${result.warm.p50} p95=${result.warm.p95} ${JSON.stringify(outcomes.warm)}`
  );

  expect(cold).toHaveLength(RUNS);
});
