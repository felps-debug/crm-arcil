"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Eraser, MapPin, Pencil } from "lucide-react";
import { ConsoleButton } from "@/components/console/console-shell";
import type { CaixaFrac, Marcacao, PontoFrac } from "@/lib/marcacao";
import type { TipoEquipamento } from "./produto-picker";

/**
 * Etapa de marcação, em tela cheia, com dois modos escolhidos por botão (não
 * mais por gesto adivinhado):
 *
 * - "Aparelho": toque posiciona a caixa (tamanho vem do palpite por família,
 *   editável); alças nos 4 cantos redimensionam.
 * - "Tubulação": o dedo desenha um traço livre — todo ponto do gesto vira uma
 *   entrada de `rota`. `parseMarcacao` (lib/marcacao.ts) e o resto do
 *   pipeline (`guide-mask.ts`, `preview-annotations.ts`) já sabem lidar com
 *   um caminho de dezenas de pontos; a única mudança de servidor desta
 *   feature foi parar de cortar `rota` pra 2.
 *
 * Decisões que seguem valendo do desenho anterior: SVG sobre `<img>`
 * (hit-testing de graça), Pointer Events (dedo e mouse pelo mesmo handler),
 * tudo em fração 0-1 (a foto muda de tamanho em cada tela).
 */

const CAIXA_INICIAL: Record<string, CaixaFrac> = {
  Cassete: { x: 0.38, y: 0.2, w: 0.24, h: 0.09 },
  Dutado: { x: 0.38, y: 0.16, w: 0.24, h: 0.06 },
  "Split Hi-Wall": { x: 0.36, y: 0.22, w: 0.28, h: 0.08 },
  "Piso-teto": { x: 0.36, y: 0.62, w: 0.28, h: 0.1 },
  Janela: { x: 0.4, y: 0.38, w: 0.2, h: 0.14 },
};
const CAIXA_PADRAO: CaixaFrac = { x: 0.36, y: 0.24, w: 0.28, h: 0.09 };

/** Piso de tamanho da caixa — abaixo disso um redimensionamento vira um
 *  retângulo pequeno demais pra a imagem-guia desenhar de forma legível
 *  (mesmo piso que `parseMarcacao` aplica no servidor). */
const CAIXA_MIN = { w: 0.05, h: 0.025 };

/** Distância mínima (fração da foto) entre dois pontos consecutivos do traço
 *  livre pra o segundo valer a pena guardar. Calibrado pra uma diagonal cheia
 *  da tela (a maior distância possível) ficar bem abaixo de MAX_PONTOS_ROTA —
 *  sem isto, um arrasto lento em tela grande gera milhares de pontos quase
 *  idênticos, e um traço comum já batia no teto de sanidade do servidor. */
const DIST_MINIMA_PONTO = 0.01;

/** Mesmo teto de `MAX_PONTOS_ROTA` em `lib/marcacao.ts` — sem isto, o traço
 *  desenhado na tela podia crescer além do que o servidor guarda
 *  (`parseMarcacao` corta em silêncio), e o vendedor confirmava um traço que
 *  não era o que ia pro pipeline: o fim do corte perdia justamente a ponta
 *  perto da condensadora, que é onde o callout de ligação ancora. */
const MAX_PONTOS_ROTA = 200;

type Handle = "nw" | "ne" | "sw" | "se";
type Modo = "aparelho" | "tubulacao";

function caixaCentradaEm(p: PontoFrac, tamanho: CaixaFrac): CaixaFrac {
  const w = tamanho.w;
  const h = tamanho.h;
  return {
    x: Math.min(1 - w, Math.max(0, p.x - w / 2)),
    y: Math.min(1 - h, Math.max(0, p.y - h / 2)),
    w,
    h,
  };
}

function dentroDaCaixa(p: PontoFrac, c: CaixaFrac): boolean {
  return p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
}

/** Redimensiona mantendo o canto OPOSTO ao que está sendo arrastado fixo. */
function redimensionar(origem: CaixaFrac, handle: Handle, p: PontoFrac): CaixaFrac {
  const fixo = {
    x: handle === "ne" || handle === "se" ? origem.x : origem.x + origem.w,
    y: handle === "sw" || handle === "se" ? origem.y : origem.y + origem.h,
  };
  const x = Math.min(fixo.x, p.x);
  const y = Math.min(fixo.y, p.y);
  const w = Math.max(CAIXA_MIN.w, Math.abs(p.x - fixo.x));
  const h = Math.max(CAIXA_MIN.h, Math.abs(p.y - fixo.y));
  return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
}

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
  const [modo, setModo] = useState<Modo>("aparelho");
  const [caixa, setCaixa] = useState<CaixaFrac>(() => (tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
  const [rota, setRota] = useState<PontoFrac[]>([]);
  const gesto = useRef<{ tipo: "mover" | "redimensionar"; handle?: Handle; origemCaixa: CaixaFrac; origemToque: PontoFrac } | null>(null);
  const desenhando = useRef(false);

  const paraFrac = useCallback((clientX: number, clientY: number): PontoFrac => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const iniciarRedimensionar = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      gesto.current = { tipo: "redimensionar", handle, origemCaixa: caixa, origemToque: paraFrac(e.clientX, e.clientY) };
    },
    [caixa, disabled, paraFrac]
  );

  const onPointerDownArea = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const p = paraFrac(e.clientX, e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);

      if (modo === "tubulacao") {
        desenhando.current = true;
        setRota([p]);
        return;
      }

      if (dentroDaCaixa(p, caixa)) {
        gesto.current = { tipo: "mover", origemCaixa: caixa, origemToque: p };
      } else {
        setCaixa(caixaCentradaEm(p, caixa));
      }
    },
    [caixa, disabled, modo, paraFrac]
  );

  const onPointerMoveArea = useCallback(
    (e: React.PointerEvent) => {
      if (modo === "tubulacao") {
        if (!desenhando.current) return;
        const p = paraFrac(e.clientX, e.clientY);
        setRota((atual) => {
          if (atual.length >= MAX_PONTOS_ROTA) return atual;
          const ultimo = atual[atual.length - 1];
          if (ultimo && Math.hypot(p.x - ultimo.x, p.y - ultimo.y) < DIST_MINIMA_PONTO) return atual;
          return [...atual, p];
        });
        return;
      }
      const g = gesto.current;
      if (!g || g.tipo !== "mover") return;
      const p = paraFrac(e.clientX, e.clientY);
      const dx = p.x - g.origemToque.x;
      const dy = p.y - g.origemToque.y;
      setCaixa({
        ...g.origemCaixa,
        x: Math.min(1 - g.origemCaixa.w, Math.max(0, g.origemCaixa.x + dx)),
        y: Math.min(1 - g.origemCaixa.h, Math.max(0, g.origemCaixa.y + dy)),
      });
    },
    [modo, paraFrac]
  );

  const onPointerMoveHandle = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      if (!g || g.tipo !== "redimensionar" || !g.handle) return;
      const p = paraFrac(e.clientX, e.clientY);
      setCaixa(redimensionar(g.origemCaixa, g.handle, p));
    },
    [paraFrac]
  );

  const onPointerUp = useCallback(() => {
    gesto.current = null;
    desenhando.current = false;
  }, []);

  const limparTraco = useCallback(() => setRota([]), []);
  const recomecarCaixa = useCallback(() => setCaixa((tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO), [tipo]);

  const rotaPath = useMemo(
    () => (rota.length >= 2 ? "M " + rota.map((p) => `${p.x * 100} ${p.y * 100}`).join(" L ") : null),
    [rota]
  );

  const confirmar = useCallback(() => onConfirm({ caixa, rota }), [caixa, rota, onConfirm]);

  const HANDLES: { id: Handle; x: number; y: number }[] = [
    { id: "nw", x: caixa.x, y: caixa.y },
    { id: "ne", x: caixa.x + caixa.w, y: caixa.y },
    { id: "sw", x: caixa.x, y: caixa.y + caixa.h },
    { id: "se", x: caixa.x + caixa.w, y: caixa.y + caixa.h },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex" role="tablist" aria-label="Modo de marcação">
        <button
          role="tab"
          aria-selected={modo === "aparelho"}
          onClick={() => setModo("aparelho")}
          className={`flex-1 py-2.5 text-[12px] font-bold ${modo === "aparelho" ? "bg-blue-500 text-white" : "bg-[var(--bg-inset)] text-[var(--text-muted)]"}`}
        >
          📦 Aparelho
        </button>
        <button
          role="tab"
          aria-selected={modo === "tubulacao"}
          onClick={() => setModo("tubulacao")}
          className={`flex-1 py-2.5 text-[12px] font-bold ${modo === "tubulacao" ? "bg-amber-400 text-black" : "bg-[var(--bg-inset)] text-[var(--text-muted)]"}`}
        >
          <Pencil size={12} className="mr-1 inline" /> Tubulação
        </button>
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        {modo === "aparelho"
          ? "Toque onde o aparelho vai ficar. Arraste pelas alças dos cantos pra ajustar o tamanho."
          : "Desenhe com o dedo o caminho que a tubulação, o dreno e o cabo elétrico vão seguir."}
      </p>

      <div
        ref={areaRef}
        onPointerDown={onPointerDownArea}
        onPointerMove={onPointerMoveArea}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        style={{ cursor: modo === "tubulacao" ? "crosshair" : "default" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl} alt="Foto do ambiente" className="h-full w-full object-contain" draggable={false} />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
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
            <path d={rotaPath} fill="none" stroke="#F5C542" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>

        {modo === "aparelho" &&
          HANDLES.map((h) => (
            <div
              key={h.id}
              onPointerDown={iniciarRedimensionar(h.id)}
              onPointerMove={onPointerMoveHandle}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-blue-500 shadow"
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              aria-label={`Redimensionar pelo canto ${h.id}`}
            />
          ))}
      </div>

      <div className="flex flex-wrap gap-2 p-3">
        {modo === "tubulacao" ? (
          <ConsoleButton icon={Eraser} onClick={limparTraco} disabled={rota.length === 0} className="flex-1 justify-center">
            Desfazer traço
          </ConsoleButton>
        ) : (
          <ConsoleButton icon={MapPin} onClick={recomecarCaixa} className="flex-1 justify-center">
            Recomeçar posição
          </ConsoleButton>
        )}
        <ConsoleButton onClick={onSkip} className="flex-1 justify-center">
          Pular
        </ConsoleButton>
        <ConsoleButton icon={Check} active onClick={confirmar} disabled={disabled} className="flex-1 justify-center">
          Confirmar marcação
        </ConsoleButton>
      </div>
    </div>
  );
}
