"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { ConsoleButton } from "@/components/console/console-shell";
import { formatMoney, formatNumber } from "@/lib/client-api";
import type { InventoryProduct } from "@/types/api";

/** As mesmas quatro opções que a pergunta de tipo oferecia antes deste seletor
 *  existir — o gerador de imagem depende delas para saber onde o equipamento se
 *  instala. */
export const TIPOS = ["Split Hi-Wall", "Cassete", "Piso-teto", "Dutado", "Janela"] as const;
export type TipoEquipamento = (typeof TIPOS)[number];

/**
 * Deduz o tipo pelo nome de catálogo do ERP.
 *
 * Devolve `null` quando não reconhece, e quem chama tem que perguntar. Chutar um
 * padrão aqui foi exatamente o bug que gerou cassete desenhado como hi-wall: o
 * tipo decide a geometria inteira do desenho, então errar em silêncio custa uma
 * imagem inteira errada.
 */
export function tipoDoProduto(nome: string | null): TipoEquipamento | null {
  const n = (nome ?? "").toUpperCase();
  if (/\bCASSETE\b/.test(n)) return "Cassete";
  if (/\bHI[\s-]?WALL\b/.test(n)) return "Split Hi-Wall";
  if (/\bDUTAD|\bDUTO\b/.test(n)) return "Dutado";
  // "PISO TETO" e "SPLIT TETO" instalam no mesmo lugar para efeito do desenho.
  if (/\bTETO\b/.test(n)) return "Piso-teto";
  // ACJ = ar condicionado de janela: unidade única no vão, sem condensadora
  // separada nem tubulação frigorígena exposta. Antes caía no default
  // "Split Hi-Wall" do route.ts sem avisar — 12 produtos no catálogo.
  if (/\bACJ\b|\bJANELA\b/.test(n)) return "Janela";
  return null;
}

export function ProdutoPicker({
  onConfirm,
  disabled,
}: {
  onConfirm: (produto: InventoryProduct, tipo: TipoEquipamento) => void;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<InventoryProduct[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState<InventoryProduct | null>(null);
  const [tipo, setTipo] = useState<TipoEquipamento | null>(null);
  const pedido = useRef(0);

  // 250ms de espera: o vendedor digita "0129c1" em rajada e sem isso são seis
  // requisições, cinco delas descartadas.
  useEffect(() => {
    const id = setTimeout(async () => {
      const meu = ++pedido.current;
      setCarregando(true);
      try {
        const res = await fetch(`/api/products/search?apenasAparelhos=1&limit=20&q=${encodeURIComponent(busca)}`);
        const data = await res.json();
        // Resposta antiga chegando depois da nova sobrescreveria a lista certa.
        if (meu !== pedido.current) return;
        setResultados(res.ok ? (data.products ?? []) : []);
      } catch {
        if (meu === pedido.current) setResultados([]);
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [busca]);

  const escolher = (p: InventoryProduct) => {
    setSelecionado(p);
    setTipo(tipoDoProduto(p.name));
  };

  const rotuloEstoque = useMemo(() => {
    if (!selecionado) return null;
    if (selecionado.stock == null) return { texto: "estoque não sincronizado", tom: "text-[var(--text-muted)]" };
    if (selecionado.stock <= 0) return { texto: "sem estoque", tom: "text-[var(--red)]" };
    return { texto: `${formatNumber(selecionado.stock)} em estoque`, tom: "text-[var(--emerald)]" };
  }, [selecionado]);

  if (selecionado) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-[8px] border border-blue-500/40 bg-blue-500/5 p-3">
          <Miniatura produto={selecionado} tamanho={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-[var(--text-primary)]">{selecionado.name}</p>
            <p className="mt-0.5 font-data text-[11px] text-[var(--text-muted)]">
              {selecionado.sku ?? selecionado.erpCode} · {selecionado.brand ?? "—"} · {formatMoney(selecionado.price)}
            </p>
            {rotuloEstoque && <p className={`mt-0.5 text-[11px] font-semibold ${rotuloEstoque.tom}`}>{rotuloEstoque.texto}</p>}
          </div>
          <button
            onClick={() => { setSelecionado(null); setTipo(null); }}
            className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)] underline hover:text-[var(--text-primary)]"
          >
            trocar
          </button>
        </div>

        {/* O tipo aparece sempre, mesmo deduzido: é ele que define a geometria do
            desenho, e uma dedução silenciosa errada custa a imagem inteira. */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {tipo ? "Tipo identificado" : "Não identifiquei o tipo — escolha"}
          </p>
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => (
              <ConsoleButton key={t} active={tipo === t} onClick={() => setTipo(t)} className="flex-1 justify-center">
                {t}
              </ConsoleButton>
            ))}
          </div>
        </div>

        <ConsoleButton
          icon={Check}
          active
          disabled={!tipo || disabled}
          onClick={() => tipo && onConfirm(selecionado, tipo)}
          className="w-full justify-center"
        >
          Confirmar produto
        </ConsoleButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3">
        {carregando ? <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" /> : <Search size={14} className="shrink-0 text-[var(--text-muted)]" />}
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código do ERP, modelo ou marca — ex: 0129C1, hisense 12000"
          className="w-full bg-transparent py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>

      <div className="max-h-[260px] space-y-1 overflow-y-auto">
        {resultados.map((p) => (
          <button
            key={`${p.source}-${p.id}`}
            onClick={() => escolher(p)}
            className="flex w-full items-center gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-left transition-colors hover:border-blue-500/50"
          >
            <Miniatura produto={p} tamanho={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{p.name}</p>
              <p className="font-data text-[10px] text-[var(--text-muted)]">
                {p.sku ?? p.erpCode} · {p.brand ?? "—"} · {formatMoney(p.price)}
                {p.stock != null && p.stock > 0 && <span className="text-[var(--emerald)]"> · {formatNumber(p.stock)} un.</span>}
              </p>
            </div>
          </button>
        ))}
        {!carregando && !resultados.length && (
          <p className="px-1 py-3 text-[12px] text-[var(--text-muted)]">
            {busca.trim() ? "Nenhum aparelho encontrado com esse termo." : "Digite para buscar no catálogo do ERP."}
          </p>
        )}
      </div>
    </div>
  );
}

/** Sem foto o seletor vira uma lista de texto e o vendedor perde a conferência
 *  visual — o ERP não fotografou 288 dos 925 produtos de ar condicionado, então
 *  o vazio é comum o bastante para merecer um lugar próprio em vez de sumir. */
function Miniatura({ produto, tamanho }: { produto: InventoryProduct; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tamanho, height: tamanho };

  if (!produto.imageUrl || falhou) {
    return (
      <div
        style={estilo}
        className="grid shrink-0 place-items-center rounded-[4px] border border-dashed border-[var(--border-strong)] text-[9px] text-[var(--text-muted)]"
      >
        sem foto
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={produto.imageUrl}
      alt={produto.name ?? ""}
      style={estilo}
      onError={() => setFalhou(true)}
      className="shrink-0 rounded-[4px] border border-[var(--border)] bg-white object-contain"
    />
  );
}
