import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda string destes arquivos pode acabar impressa na prévia do cliente. Já
 * saiu "Mesmo nivel do ambiente" assim. Chaves internas (só minúsculas e _)
 * ficam de fora: são identificadores, não texto.
 */
const ARQUIVOS = [
  "src/app/chatbot/_components/step-groups.ts",
  "src/lib/alertas-instalacao.ts",
  "src/lib/server/installation-overlay.ts",
  "src/lib/server/preview-annotations.ts",
  "src/constants/hvac-standards.ts",
  "src/constants/arcil-brand.ts",
  "src/app/api/generate-image/condensadora-local/route.ts",
];

const SEM_ACENTO = [
  "instalacao", "tubulacao", "nivel", "sera", "pe-direito", "pe direito", "eletrico", "eletrica", "distancia",
  "alcapao", "manutencao", "vacuo", "agua", "vao", "minimo", "minima", "maximo", "tensao", "area", "tecnica",
  "tecnico", "inclinacao", "ligacao", "conexao", "obrigatorio", "obrigatoria", "protecao", "ventilacao",
  "posicao", "previa", "nao", "sao", "ja", "apos", "chao", "ate", "numero", "opcao", "especificacoes",
  "isolacao", "condensacao", "fixacao", "termico", "termica", "compativel",
];

function semComentarios(fonte: string): string {
  // Comentário cita o erro antigo de propósito ("NAO SEI DIZER" foi parar na
  // imagem) e tem apóstrofo solto que desalinha a leitura dos literais.
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function literais(fonteBruta: string): string[] {
  const fonte = semComentarios(fonteBruta);
  const achados: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of fonte.matchAll(re)) {
    const texto = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    if (/^[a-z0-9_./@-]*$/.test(texto)) continue;
    achados.push(texto);
  }
  return achados;
}

describe("texto que vai para a imagem", () => {
  it.each(ARQUIVOS)("%s não tem palavra sem acento", (arquivo) => {
    const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");
    const erros: string[] = [];
    for (const texto of literais(fonte)) {
      for (const palavra of SEM_ACENTO) {
        if (new RegExp(`(^|[^\\p{L}])${palavra}([^\\p{L}]|$)`, "iu").test(texto)) erros.push(`"${palavra}" em: ${texto.slice(0, 160)}`);
      }
    }
    expect(erros).toEqual([]);
  });
});
