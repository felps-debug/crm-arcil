"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { ConsoleButton, ConsoleCard } from "@/components/console/console-shell";
import { useToast } from "@/components/ui/toast";
import { checkRedisparos } from "@/lib/supabase/queries";
import { parseSheetLeads, parseSheetRows, type DisparoLead } from "../cobranca-helpers";

export function DispararTab({ onDispatched }: { onDispatched: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DisparoLead[]>([]);
  // O preview mostra um cliente por linha; o disparo manda um BOLETO por linha.
  // Agrupar antes de enviar apagava os boletos extras — ver parseSheetRows().
  const [linhasDisparo, setLinhasDisparo] = useState<DisparoLead[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; inserted?: number; error?: string } | null>(null);
  const [redisparoWarnings, setRedisparoWarnings] = useState<
    { telefone: string; nome: string | null; data_disparo: string | null }[]
  >([]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParseError(null);
    setPreview([]);
    setLinhasDisparo([]);
    setDispatchResult(null);
    setFileName(file.name);
    setRedisparoWarnings([]);
    const { read: xlsxRead, utils: xlsxUtils } = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = xlsxRead(new Uint8Array(ev.target!.result as ArrayBuffer), { type: "array" });
        // raw: false → usa o texto formatado da célula (evita corromper "530,00" em 53000
        // e datas em números de série ao ler CSV/XLSX do relatório do ERP)
        const rows = xlsxUtils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
          defval: "",
          raw: false,
        });
        const leads = parseSheetLeads(rows);
        if (!leads.length) throw new Error("Nenhum lead válido. Verifique se há coluna de telefone.");
        setPreview(leads);
        setLinhasDisparo(parseSheetRows(rows));
        checkRedisparos(leads.map((l) => l.numero).filter(Boolean)).then(setRedisparoWarnings);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao processar arquivo.";
        setParseError(message);
        toast(message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleDispatch() {
    if (!linhasDisparo.length) return;
    setDispatching(true);
    setDispatchResult(null);
    try {
      const res = await fetch("/api/cobranca/disparo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: linhasDisparo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao disparar");
      setDispatchResult({ ok: true, inserted: data.inserted });
      setPreview([]);
      setLinhasDisparo([]);
      setFileName(null);
      onDispatched();
      // O serviço de cobrança responde 200 mesmo descartando lead. Antes o CRM
      // anunciava o número enviado como se fosse o gravado — um disparo de 2
      // com 1 gravado dizia "2 leads inseridos".
      const perdidos: string[] = data.missing ?? [];
      if (perdidos.length > 0) {
        toast(
          `${data.inserted} de ${data.sent} gravados. Nao entraram: ${perdidos.join(", ")}`,
          "error"
        );
      } else {
        toast(`${data.inserted} leads inseridos — acompanhe no Monitoramento`, "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro";
      setDispatchResult({ ok: false, error: message });
      toast(message, "error");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <ConsoleCard>
      <div className="mb-4">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Disparar Cobrança</h2>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Importe uma planilha e dispare mensagens de cobrança</p>
      </div>

      <div className="space-y-5">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group cursor-pointer rounded-[14px] border-2 border-dashed border-[var(--border)] p-10 text-center transition-all hover:border-blue-500/60 hover:bg-blue-500/5"
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          <FileSpreadsheet size={28} className="mx-auto mb-3 text-[var(--text-muted)] transition-colors group-hover:text-blue-400" />
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">{fileName ?? "Clique para importar planilha"}</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            CSV, XLSX, XLS · Colunas: telefone, nome, valor, vencimento, documento
          </p>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 rounded-[10px] border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
            <X size={14} /> {parseError}
          </div>
        )}

        {dispatchResult && (
          <div
            className={`flex items-center gap-2 rounded-[10px] border px-4 py-3 text-[13px] ${
              dispatchResult.ok
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/25 bg-red-500/10 text-red-300"
            }`}
          >
            {dispatchResult.ok ? <CheckCircle2 size={14} /> : <X size={14} />}
            {dispatchResult.ok
              ? `${dispatchResult.inserted} leads inseridos — acompanhe no Monitoramento`
              : dispatchResult.error}
          </div>
        )}

        {preview.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-[var(--text-primary)]">
                {preview.length} cliente{preview.length !== 1 ? "s" : ""} ·{" "}
                {preview.reduce((s, l) => s + parseInt(l.boleto_count || "1"), 0)} boletos
              </p>
              <button
                onClick={() => {
                  setPreview([]);
                  setLinhasDisparo([]);
                  setFileName(null);
                }}
                className="flex items-center gap-1 text-[12px] text-[var(--text-muted)] transition-colors hover:text-red-400"
              >
                <X size={12} /> Limpar
              </button>
            </div>

            <div className="overflow-hidden rounded-[10px] border border-[var(--border)]">
              <div className="max-h-56 overflow-y-auto overflow-x-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg-inset)]">
                    <tr>
                      {["Número", "Nome", "Valor Total c/ Juros", "Vencimento(s)", "Boletos"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((l, i) => {
                      const count = parseInt(l.boleto_count || "1");
                      return (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-3 py-2 font-data text-[var(--text-primary)]">{l.numero}</td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">{l.nome || "—"}</td>
                          <td className="px-3 py-2 font-semibold text-emerald-400">{l.valor || "—"}</td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-[11px] text-[var(--text-muted)]" title={l.vencimento}>
                            {l.vencimento || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[10px] font-bold ${
                                count > 1
                                  ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                                  : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                              }`}
                            >
                              {count} bol.
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {redisparoWarnings.length > 0 && (
              <div className="flex items-start gap-3 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
                <div>
                  <p className="mb-1 text-[12px] font-bold text-amber-300">
                    {redisparoWarnings.length} cliente{redisparoWarnings.length !== 1 ? "s" : ""} com cobrança pendente nos últimos 30 dias:
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-amber-300/80">
                    {redisparoWarnings.map((w) => (
                      <li key={w.telefone}>
                        • {w.nome ?? w.telefone} — último disparo{" "}
                        {w.data_disparo ? new Date(w.data_disparo).toLocaleDateString("pt-BR") : "—"}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[10px] text-amber-400/70">Pode continuar — é só um aviso.</p>
                </div>
              </div>
            )}

            <ConsoleButton active onClick={handleDispatch} disabled={dispatching} icon={dispatching ? undefined : Upload}>
              {dispatching ? <Loader2 size={14} className="animate-spin" /> : null}
              {dispatching ? "Disparando..." : `Disparar para ${preview.length} cliente${preview.length !== 1 ? "s" : ""}`}
            </ConsoleButton>
          </div>
        )}
      </div>
    </ConsoleCard>
  );
}
