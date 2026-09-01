"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Eraser, MapPin } from "lucide-react";
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
 * Interação reduzida ao mínimo: 1 toque posiciona o aparelho (tamanho vem do
 * palpite por família, não é redimensionável — um vendedor no meio de uma
 * visita não vai afinar cantos de retângulo) e 1 arrasto define a direção da
 * infraestrutura (reta, não uma rota ponto a ponto). O ponto elétrico não tem
 * marca própria: a pergunta "já existe ponto elétrico?" do questionário já
 * cobre isso.
 *
 * Decisões de implementação que não são estilo:
 *
 * - **SVG sobre `<img>`, não `<canvas>`.** Cada marca é um nó do DOM, então
 *   hit-testing e re-render em mudança de tamanho vêm de graça. Com canvas
 *   seria preciso reimplementar os dois, além de lidar com `devicePixelRatio`
 *   para o traço não sair borrado no celular.
 * - **Pointer Events, não mouse/touch separados.** Um único conjunto de
 *   handlers atende dedo e mouse — que é o requisito (campo no celular,
 *   escritório no desktop). `touch-action: none` impede o navegador de rolar a
 *   página no meio de um arraste.
 * - **Tudo em fração 0-1.** A foto é exibida numa largura diferente em cada
 *   tela, o Gemini devolve a cena num tamanho que não escolhemos, e a camada
 *   vetorial compõe num terceiro. Pixel de tela não sobrevive a isso.
 * - **Tap vs. arrasto decidido pela distância percorrida em pixels de tela**
 *   (`LIMIAR_ARRASTO`), não em fração — fração depende da largura da foto na
 *   tela, e um limiar em fração ficaria apertado demais numa foto exibida
 *   pequena e frouxo demais numa grande.
 */

/** Palpite inicial da caixa por família de equipamento — só decide TAMANHO
 *  agora (a posição some no primeiro toque). Cassete e dutado moram no forro,
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

/** Abaixo disso, o gesto é um toque (posiciona o aparelho); acima, é um
 *  arrasto (traça a direção da infra). Grande o bastante para não confundir
 *  o tremor natural de um toque de dedo com início de arrasto. */
const LIMIAR_ARRASTO_PX = 12;

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
  const tamanhoPadrao = useMemo(() => (tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO, [tipo]);
  const [caixa, setCaixa] = useState<CaixaFrac>(() => (tipo && CAIXA_INICIAL[tipo]) || CAIXA_PADRAO);
  const [rota, setRota] = useState<PontoFrac[]>([]);
  const [linhaEmCurso, setLinhaEmCurso] = useState<PontoFrac | null>(null);
  const gesto = useRef<{ inicioClientX: number; inicioClientY: number; origemFrac: PontoFrac; virouArrasto: boolean } | null>(null);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const p = paraFrac(e.clientX, e.clientY);
      gesto.current = { inicioClientX: e.clientX, inicioClientY: e.clientY, origemFrac: p, virouArrasto: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled, paraFrac]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      if (!g) return;
      const distPx = Math.hypot(e.clientX - g.inicioClientX, e.clientY - g.inicioClientY);
      if (!g.virouArrasto && distPx < LIMIAR_ARRASTO_PX) return;
      g.virouArrasto = true;
      // A partir do momento em que virou arrasto, a linha nasce sempre do
      // centro do aparelho — de onde o dedo apertou primeiro não importa, o
      // que importa é a direção/distância até onde soltou.
      setLinhaEmCurso(paraFrac(e.clientX, e.clientY));
    },
    [paraFrac]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      gesto.current = null;
      if (!g || disabled) {
        setLinhaEmCurso(null);
        return;
      }
      if (g.virouArrasto) {
        const fim = paraFrac(e.clientX, e.clientY);
        setRota([{ x: caixa.x + caixa.w / 2, y: caixa.y + caixa.h / 2 }, fim]);
      } else {
        setCaixa(caixaCentradaEm(g.origemFrac, tamanhoPadrao));
      }
      setLinhaEmCurso(null);
    },
    [disabled, caixa, tamanhoPadrao, paraFrac]
  );

  const limparRota = useCallback(() => setRota([]), []);

  const limparTudo = useCallback(() => {
    setCaixa(tamanhoPadrao);
    setRota([]);
  }, [tamanhoPadrao]);

  const centro = { x: caixa.x + caixa.w / 2, y: caixa.y + caixa.h / 2 };
  const rotaPath = useMemo(() => {
    const pontos = linhaEmCurso ? [centro, linhaEmCurso] : rota;
    return pontos.length >= 2 ? "M " + pontos.map((p) => `${p.x * 100} ${p.y * 100}`).join(" L ") : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota, linhaEmCurso, caixa]);

  const confirmar = useCallback(() => {
    onConfirm({ caixa, rota });
  }, [caixa, rota, onConfirm]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        Toque na foto onde o aparelho vai ficar. Se a infraestrutura sobe, desce ou sai pro lado, arraste na direção que ela segue.
      </p>

      <div
        ref={areaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full touch-none select-none overflow-hidden rounded-[8px] border border-[var(--border)]"
        style={{ cursor: "crosshair" }}
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
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        <ConsoleButton icon={Eraser} onClick={limparRota} disabled={rota.length === 0} className="flex-1 justify-center">
          Tirar direção
        </ConsoleButton>
        <ConsoleButton icon={MapPin} onClick={limparTudo} className="flex-1 justify-center">
          Recomeçar
        </ConsoleButton>
        <ConsoleButton onClick={onSkip} className="flex-1 justify-center">
          Pular
        </ConsoleButton>
      </div>

      <ConsoleButton icon={Check} active onClick={confirmar} disabled={disabled} className="w-full justify-center">
        Confirmar marcação
      </ConsoleButton>
    </div>
  );
}
