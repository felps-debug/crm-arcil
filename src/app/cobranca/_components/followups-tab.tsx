"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { ConsoleCard, ConsoleError, ConsoleLoading, ConsoleStatus } from "@/components/console/console-shell";
import type { Followup } from "@/types";
import { proximoToque, proximoToqueTimestamp } from "../cobranca-helpers";

type StatusFiltro = "Todos" | "Pendente" | "Respondeu";

function ProximoToqueCell({ followup }: { followup: Followup }) {
  const { texto, tone } = proximoToque(followup);
  if (tone === "slate") {
    return <span className="text-[11px] text-[var(--text-muted)]">{texto}</span>;
  }
  return <ConsoleStatus tone={tone}>{texto}</ConsoleStatus>;
}

export function FollowupsTab({
  followups,
  loading,
  error,
}: {
  followups: Followup[] | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("Todos");

  const filtered = useMemo(() => {
    let result = followups ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((f) => f.nome_cliente?.toLowerCase().includes(q) || f.numero_cliente?.includes(q));
    }
    if (statusFiltro === "Pendente") result = result.filter((f) => !f.respondeu);
    if (statusFiltro === "Respondeu") result = result.filter((f) => f.respondeu);
    // Quem toca primeiro fica no topo — é a pergunta de quem opera essa tela:
    // "quem eu preciso acompanhar agora?", não "quem entrou primeiro na fila".
    return [...result].sort((a, b) => proximoToqueTimestamp(a) - proximoToqueTimestamp(b));
  }, [followups, search, statusFiltro]);

  return (
    <ConsoleCard pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Follow-ups de Cobrança</h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Acompanhamento de respostas — ordenado por quem toca primeiro</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Nome ou telefone..."
            aria-label="Buscar por nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500/60"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["Todos", "Pendente", "Respondeu"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFiltro(s)}
              className={`rounded-[8px] px-2.5 py-1 text-[11px] font-bold transition-all ${
                statusFiltro === s
                  ? "bg-blue-500 text-white"
                  : "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto font-data text-[11px] text-[var(--text-muted)]">
          {filtered.length}/{followups?.length ?? 0}
        </span>
      </div>

      {loading ? (
        <div className="p-4">
          <ConsoleLoading />
        </div>
      ) : error ? (
        <div className="p-4">
          <ConsoleError message={error} />
        </div>
      ) : !filtered.length ? (
        <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">
          {followups?.length ? "Nenhum follow-up bate com esse filtro" : "Nenhum follow-up"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
                {["Cliente", "Telefone", "Step", "Próximo toque", "Respondeu", "Última Msg", "Status"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-[var(--text-primary)]">{f.nome_cliente ?? "—"}</td>
                  <td className="px-3 py-2.5 font-data text-[var(--text-secondary)]">{f.numero_cliente ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <ConsoleStatus tone={f.followup_step && f.followup_step >= 3 ? "red" : "blue"}>Step {f.followup_step ?? 0}</ConsoleStatus>
                  </td>
                  <td className="px-3 py-2.5">
                    <ProximoToqueCell followup={f} />
                  </td>
                  <td className="px-3 py-2.5">
                    {f.respondeu ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-[var(--text-muted)]" />}
                  </td>
                  <td className="px-3 py-2.5 font-data text-[11px] text-[var(--text-muted)]">
                    {f.ultima_msg_ia ? new Date(f.ultima_msg_ia).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <ConsoleStatus tone={f.status === "PENDING" ? "amber" : "slate"}>{f.status ?? "—"}</ConsoleStatus>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleCard>
  );
}
