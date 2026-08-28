"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Eraser, MousePointerSquareDashed, Route, Undo2, Zap } from "lucide-react";
import { ConsoleButton } from "@/components/console/console-shell";
import type { CaixaFrac, Marcacao, PontoFrac } from "@/lib/marcacao";
import type { TipoEquipamento } from "./produto-picker";

/**
 * Ferramenta de marcação sobre a foto do ambiente.
 *
 * Por que ela existe: até aqui quem decidia onde o aparelho ficava e por onde a
 * tubulação corria era o modelo de imagem, com base numa descrição em texto —
 * e ele errava bastante. A marcação transforma essa decisão em dado do
 * vendedor, e esse dado é usado em dois lugares com precisões diferentes: vira
 * uma imagem-guia para o Gemini (que posiciona a cena aproximadamente) e vira a
 * âncora EXATA dos callouts, cotas e rota que o CRM desenha por cima.
 *
 * Decisões de implementação que não são estilo:
 *
 * - **SVG sobre `<img>`, não `<canvas>`.** Cada marca é um nó do DOM, então
 *   hit-testing, handles de arraste e re-render em mudança de tamanho vêm de
 *   graça. Com canvas seria preciso reimplementar os três, além de lidar com
 *   `devicePixelRatio` para o traço não sair borrado no celular.
 * - **Pointer Events, não mouse/touch separados.** Um único conjunto de
 *   handlers atende dedo e mouse — que é o requisito (campo no celular,
 *   escritório no desktop). `touch-action: none` impede o navegador de rolar a
 *   página no meio de um arraste.
 * - **Tudo em fração 0-1.** A foto é exibida numa largura diferente em cada
 *   tela, o Gemini devolve a cena num tamanho que não escolhemos, e a camada
 *   vetorial compõe num terceiro. Pixel de tela não sobrevive a isso.
 */

type Ferramenta = "caixa" | "rota" | "eletrico";

/** Palpite inicial da caixa por família de equipamento. O vendedor corrige
 *  arrastando — é bem mais rápido que desenhar do zero, e é o uso honesto do
 *  que sabemos sem detectar nada na foto: cassete e dutado moram no forro,
 *  hi-wall fica alto na parede, piso-teto embaixo, janela num vão a meia
 *  altura. */
const CAIXA_INICIAL: Record<string, CaixaFrac> = {
  Cassete: { x: 0.38, y: 0.2, w: 0.24, h: 0.09 },
  Dutado: { x: 0.38, y: 0.16, w: 0.24, h: 0.06 },
  "Split Hi-Wall": { x: 0.36, y: 0.22, w: 0.28, h: 0.08 },
  "Piso-teto": { x: 0.36, y: 0.62, w: 0.28, h: 0.1 },
  Janela: { x: 0.4, y: 0.38, w: 0.2, h: 0.14 },
};
const CAIXA_PADRAO: CaixaFrac = { x: 0.36, y: 0.24, w: 0.28, h: 0.09 };

/** Alvo de toque dos handles. Desenhados com 7px de raio, mas capturam num
 *  raio bem maior — um handle de 7px é impossível de pegar com o dedo. */
const RAIO_PEGADA = 26;

type Alca = "nw" | "ne" | "sw" | "se" | "mover";

export function MarcadorInstalacao({
  fotoUrl,
  tipo,
  onConfirm,
  onSkip,
  disabled,
}: {
  fotoUrl: string;
  tipo: TipoEquipamento | null;
  onConfirm: (m: Marcacao) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("caixa");
  const [caixa, setCaixa] = useState<CaixaFrac>(() => (tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
  const [rota, setRota] = useState<PontoFrac[]>([]);
  const [eletrico, setEletrico] = useState<PontoFrac | null>(null);
  const arraste = useRef<{ alca: Alca; origem: PontoFrac; caixaInicial: CaixaFrac } | null>(null);

  /** Converte coordenada de tela para fração da foto. Usa
   *  `getBoundingClientRect` a cada evento em vez de guardar o tamanho: a foto
   *  muda de largura quando o teclado do celular abre, quando o dispositivo
   *  gira e quando a coluna do chat encolhe no desktop. */
  const paraFrac = useCallback((clientX: number, clientY: number): PontoFrac => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const alcaSob = useCallback(
    (p: PontoFrac): Alca | null => {
      const rect = areaRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const dist = (fx: number, fy: number) => Math.hypot((p.x - fx) * rect.width, (p.y - fy) * rect.height);
      const cantos: [Alca, number, number][] = [
        ["nw", caixa.x, caixa.y],
        ["ne", caixa.x + caixa.w, caixa.y],
        ["sw", caixa.x, caixa.y + caixa.h],
        ["se", caixa.x + caixa.w, caixa.y + caixa.h],
      ];
      for (const [alca, fx, fy] of cantos) if (dist(fx, fy) <= RAIO_PEGADA) return alca;
      const dentro = p.x >= caixa.x && p.x <= caixa.x + caixa.w && p.y >= caixa.y && p.y <= caixa.y + caixa.h;
      return dentro ? "mover" : null;
    },
    [caixa]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const p = paraFrac(e.clientX, e.clientY);

      if (ferramenta === "rota") {
        setRota((r) => [...r, p]);
        return;
      }
      if (ferramenta === "eletrico") {
        setEletrico(p);
        return;
      }

      const alca = alcaSob(p);
      // Fora da caixa com a ferramenta de caixa ativa: recomeça o retângulo a
      // partir daqui. É o gesto que um vendedor tenta primeiro quando o palpite
      // inicial caiu longe do lugar certo.
      const alcaEfetiva: Alca = alca ?? "se";
      if (!alca) setCaixa({ x: p.x, y: p.y, w: 0.001, h: 0.001 });
      arraste.current = { alca: alcaEfetiva, origem: p, caixaInicial: alca ? caixa : { x: p.x, y: p.y, w: 0.001, h: 0.001 } };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled, ferramenta, paraFrac, alcaSob, caixa]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const a = arraste.current;
      if (!a) return;
      const p = paraFrac(e.clientX, e.clientY);
      const dx = p.x - a.origem.x;
      const dy = p.y - a.origem.y;
      const c = a.caixaInicial;

      if (a.alca === "mover") {
        setCaixa({
          x: Math.min(1 - c.w, Math.max(0, c.x + dx)),
          y: Math.min(1 - c.h, Math.max(0, c.y + dy)),
          w: c.w,
          h: c.h,
        });
        return;
      }

      // Cantos: recalcula as duas bordas afetadas e normaliza. Normalizar é o
      // que permite arrastar o canto "para o outro lado" sem produzir largura
      // negativa (que renderizaria um rect vazio no SVG).
      let x1 = c.x;
      let y1 = c.y;
      let x2 = c.x + c.w;
      let y2 = c.y + c.h;
      if (a.alca === "nw" || a.alca === "sw") x1 = c.x + dx;
      if (a.alca === "ne" || a.alca === "se") x2 = c.x + c.w + dx;
      if (a.alca === "nw" || a.alca === "ne") y1 = c.y + dy;
      if (a.alca === "sw" || a.alca === "se") y2 = c.y + c.h + dy;
      const nx = Math.max(0, Math.min(x1, x2));
      const ny = Math.max(0, Math.min(y1, y2));
      setCaixa({ x: nx, y: ny, w: Math.min(1 - nx, Math.abs(x2 - x1)), h: Math.min(1 - ny, Math.abs(y2 - y1)) });
    },
    [paraFrac]
  );

  const onPointerUp = useCallback(() => {
    arraste.current = null;
  }, []);

  const desfazer = useCallback(() => {
    if (ferramenta === "rota") setRota((r) => r.slice(0, -1));
    else if (ferramenta === "eletrico") setEletrico(null);
    else setCaixa((tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
  }, [ferramenta, tipo]);

  const limpar = useCallback(() => {
    setCaixa((tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
    setRota([]);
    setEletrico(null);
  }, [tipo]);

  const caixaValida = caixa.w >= 0.03 && caixa.h >= 0.015;
  const rotaPath = useMemo(
    () => (rota.length >= 2 ? "M " + rota.map((p) => `${p.x * 100} ${p.y * 100}`).join(" L ") : null),
    [rota]
  );

  const confirmar = useCallback(() => {
    if (!caixaValida) return;
    onConfirm({ caixa, rota: rota.length >= 2 ? rota : [], pontoEletrico: eletrico });
  }, [caixaValida, caixa, rota, eletrico, onConfirm]);

  const botaoFerramenta = (id: Ferramenta, Icone: typeof Route, rotulo: string) => (
    <ConsoleButton
      key={id}
      icon={Icone}
      active={ferramenta === id}
      onClick={() => setFerramenta(id)}
      className="flex-1 justify-center"
    >
      {rotulo}
    </ConsoleButton>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {botaoFerramenta("caixa", MousePointerSquareDashed, "Aparelho")}
        {botaoFerramenta("rota", Route, "Tubulação")}
        {botaoFerramenta("eletrico", Zap, "Elétrico")}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        {ferramenta === "caixa"
          ? "Arraste para posicionar e redimensionar o retângulo onde o aparelho será instalado."
          : ferramenta === "rota"
            ? "Toque ponto a ponto no caminho da tubulação, do aparelho até a saída para a condensadora."
            : "Toque onde fica o ponto elétrico."}
      </p>

      <div
        ref={areaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full touch-none select-none overflow-hidden rounded-[8px] border border-[var(--border)]"
        style={{ cursor: ferramenta === "caixa" ? "crosshair" : "pointer" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl} alt="Foto do ambiente" className="block w-full" draggable={false} />

        {/* `viewBox` 0-100 em X e Y com `preserveAspectRatio="none"`: as marcas
            já são fração dos lados, então esticar o sistema de coordenadas
            junto com a foto é exatamente o comportamento correto. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect
            x={caixa.x * 100}
            y={caixa.y * 100}
            width={caixa.w * 100}
            height={caixa.h * 100}
            fill="rgba(78,161,255,0.22)"
            stroke="#4EA1FF"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
          {rotaPath ? (
            <path
              d={rotaPath}
              fill="none"
              stroke="#F5C542"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {rota.map((p, i) => (
            <circle key={i} cx={p.x * 100} cy={p.y * 100} r={0.8} fill="#F5C542" vectorEffect="non-scaling-stroke" />
          ))}
          {eletrico ? (
            <circle
              cx={eletrico.x * 100}
              cy={eletrico.y * 100}
              r={1.4}
              fill="rgba(245,197,66,0.5)"
              stroke="#F5C542"
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* Handles como elementos HTML, não SVG: com `viewBox` esticado, um
            círculo SVG sairia ovalado em foto que não é quadrada. */}
        {(
          [
            [caixa.x, caixa.y],
            [caixa.x + caixa.w, caixa.y],
            [caixa.x, caixa.y + caixa.h],
            [caixa.x + caixa.w, caixa.y + caixa.h],
          ] as const
        ).map(([fx, fy], i) => (
          <div
            key={i}
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow"
            style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ConsoleButton icon={Undo2} onClick={desfazer} className="flex-1 justify-center">
          Desfazer
        </ConsoleButton>
        <ConsoleButton icon={Eraser} onClick={limpar} className="flex-1 justify-center">
          Limpar
        </ConsoleButton>
        <ConsoleButton onClick={onSkip} className="flex-1 justify-center">
          Pular
        </ConsoleButton>
      </div>

      <ConsoleButton
        icon={Check}
        active
        onClick={confirmar}
        disabled={disabled || !caixaValida}
        className="w-full justify-center"
      >
        Confirmar marcação
      </ConsoleButton>
    </div>
  );
}
