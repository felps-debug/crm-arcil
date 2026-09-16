import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Isolated git worktrees (e.g. created by parallel agent workflows) —
    // each is a full nested checkout and must not be linted as part of this project.
    // Este repo cria os worktrees em /.worktrees/ (raiz); sem esta entrada o
    // lint local entra nos checkouts aninhados e acusa milhares de problemas
    // que não são deste código. O CI não via isso porque lá a pasta não existe.
    ".worktrees/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
