import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A anon key na Vercel vem com BOM (U+FEFF) no começo. Qualquer código que leia
 * process.env direto e mande a chave num header quebra com "Cannot convert
 * argument to a ByteString" — foi assim que o proxy com getClaims() mandou
 * todo mundo para o /login no preview. Só src/lib/env.ts pode ler estas
 * variáveis; ele limpa o que não for ASCII.
 */
const VARS = /process\.env\.(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("variáveis do Supabase", () => {
  it("só são lidas em src/lib/env.ts", () => {
    const src = path.resolve(__dirname);
    const offenders = sourceFiles(src)
      .filter((file) => path.relative(src, file) !== path.join("lib", "env.ts"))
      .filter((file) => VARS.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(src, file));
    expect(offenders).toEqual([]);
  });
});
