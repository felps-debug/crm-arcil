/**
 * Linguagem visual única da infraestrutura na cena. Vai para o n8n dentro de
 * `equipment_guidance` (que o prompt já consome) e também como `estilo_infra`.
 * Mesma cor e transparência em toda prévia: é o que faz duas prévias
 * diferentes parecerem da mesma família.
 *
 * Em inglês de propósito: é instrução ao modelo de imagem, nunca impressa.
 */
const COMUM =
  "X-ray style is always the same: the covering surface becomes about 35% transparent ONLY along the route, with a soft light-blue edge glow; " +
  "inside it, two copper pipes with black foam insulation, one white drain hose with continuous downward slope, and one grey power cable, " +
  "running from the indoor unit to the exit point. NO letters, numbers, labels or arrows anywhere. Do not change anything outside the unit and its route.";

export function diretrizRaioX(tipo: string, tubulacao: string | null): string {
  const t = tipo.trim().toLowerCase();
  if (t === "janela") return "";
  const tub = (tubulacao ?? "").toLowerCase();
  let caso: string;
  if (t === "cassete" || t === "dutado" || tub.includes("forro")) {
    caso =
      "Only the square grille panel of the indoor unit is visible, flush with the ceiling; the unit body stays hidden above the ceiling, never hanging below it. " +
      "Show the infrastructure running above the ceiling: the plaster/PVC/wood ceiling becomes translucent only over the pipe route (x-ray cut-away).";
  } else if (tub.includes("sem canaleta")) {
    // Antes de "canaleta": "sem canaleta" também contém a palavra.
    caso = "Show the insulated pipes, drain and cable exposed on the wall, neatly bundled and fixed with white clamps, no duct.";
  } else if (tub.includes("canaleta")) {
    caso = "Show a semi-transparent white PVC wall duct (canaleta) fixed on the wall surface, with the pipes, drain and cable visible inside it.";
  } else {
    caso = "Show the infrastructure inside the wall: a translucent cut-away of the masonry/drywall (x-ray) along the route.";
  }
  return `${caso} ${COMUM}`;
}
