#!/usr/bin/env node
// Compara duas medições de e2e/perf/dashboard.perf.ts (RF-022).
//   node scripts/perf-compare.mjs perf-results/baseline-*.json perf-results/final-*.json
// Sai com 1 se o candidato estourar o orçamento da spec (CS-001, CS-002).

import { readFileSync } from "node:fs";

const COLD_P95_BUDGET = 2000;
const WARM_P95_BUDGET = 300;

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error("uso: node scripts/perf-compare.mjs <baseline.json> <candidato.json>");
  process.exit(2);
}

const load = (file) => JSON.parse(readFileSync(file, "utf8"));
const baseline = load(baselinePath);
const candidate = load(candidatePath);

const delta = (before, after) =>
  before == null || after == null || before === 0 ? "—" : `${(((after - before) / before) * 100).toFixed(1)}%`;

const rows = [
  ["cold p50", baseline.cold.p50, candidate.cold.p50],
  ["cold p95", baseline.cold.p95, candidate.cold.p95],
  ["warm p50", baseline.warm.p50, candidate.warm.p50],
  ["warm p95", baseline.warm.p95, candidate.warm.p95],
];

console.log(`baseline:  ${baseline.label} (${baseline.measuredAt}, marcador ${baseline.marker})`);
console.log(`candidato: ${candidate.label} (${candidate.measuredAt}, marcador ${candidate.marker})\n`);
console.log("| Métrica | Baseline (ms) | Candidato (ms) | Delta |");
console.log("|---|---|---|---|");
for (const [name, before, after] of rows) console.log(`| ${name} | ${before} | ${after} | ${delta(before, after)} |`);

const failures = [];
if (candidate.cold.p95 > COLD_P95_BUDGET) failures.push(`cold p95 ${candidate.cold.p95} > ${COLD_P95_BUDGET}`);
if (candidate.warm.p95 > WARM_P95_BUDGET) failures.push(`warm p95 ${candidate.warm.p95} > ${WARM_P95_BUDGET}`);

if (failures.length) {
  console.error(`\nFora do orçamento: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nDentro do orçamento (CS-001, CS-002).");
