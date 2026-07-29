"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AirVent,
  ArrowLeftRight,
  ArrowLeft,
  ImagePlus,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsolePage,
  ConsoleStatus,
} from "@/components/console/console-shell";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

type Step =
  | { key: string; question: string; type: "text" }
  | { key: string; question: string; type: "file" }
  | { key: string; question: string; type: "choice"; options: string[] };

const STEPS: Step[] = [
  { key: "ambiente", question: "Qual o ambiente da instalacao?", type: "text" },
  { key: "foto", question: "Envie uma foto da parede", type: "file" },
  { key: "modelo", question: "Qual o modelo do ar-condicionado?", type: "text" },
  { key: "pe_direito", question: "Qual a altura do pe-direito?", type: "text" },
  { key: "ponto_eletrico", question: "Ja existe ponto eletrico na parede?", type: "choice", options: ["Sim", "Nao"] },
  { key: "unidade_externa", question: "Onde ficara a unidade externa (condensadora)?", type: "text" },
  { key: "tubulacao", question: "Tipo de tubulacao?", type: "choice", options: ["Embutida na parede", "Canaleta aparente"] },
];

export default function ChatbotPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textValue, setTextValue] = useState("");
  const [wallImageUrl, setWallImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [dividerPct, setDividerPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  useEffect(() => {
    if (current?.type === "text") setTextValue(answers[current.key] ?? "");
  }, [step, current, answers]);

  const answered = current
    ? current.type === "file"
      ? Boolean(wallImageUrl)
      : current.type === "text"
        ? Boolean(textValue.trim())
        : Boolean(answers[current.key])
    : false;

  const buildMessages = useCallback((finalAnswers: Record<string, string>): ChatMessage[] => {
    const messages: ChatMessage[] = [];
    for (const s of STEPS) {
      messages.push({ role: "assistant", content: s.question });
      if (s.type === "file") {
        messages.push({ role: "user", content: "Foto da parede enviada.", imageUrl: wallImageUrl ?? undefined });
      } else {
        messages.push({ role: "user", content: finalAnswers[s.key] ?? "" });
      }
    }
    return messages;
  }, [wallImageUrl]);

  const requestGeneration = useCallback(
    async (finalAnswers: Record<string, string>) => {
      setGenerating(true);
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: buildMessages(finalAnswers), imageUrl: wallImageUrl }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Nao foi possivel gerar a imagem.", "error");
          return;
        }
        setGeneratedImageUrl(data.imageUrl);
        setDividerPct(50);
      } catch {
        toast("Erro de conexao ao gerar a imagem.", "error");
      } finally {
        setGenerating(false);
      }
    },
    [buildMessages, wallImageUrl, toast]
  );

  const handleNext = useCallback(() => {
    if (!current || !answered) return;
    const nextAnswers = current.type === "file" ? answers : { ...answers, [current.key]: textValue.trim() };
    setAnswers(nextAnswers);
    setTextValue("");

    if (isLastStep) {
      void requestGeneration(nextAnswers);
      return;
    }
    setStep((s) => s + 1);
  }, [current, answered, answers, textValue, isLastStep, requestGeneration]);

  const handleBack = useCallback(() => {
    if (step === 0) return;
    setStep((s) => s - 1);
  }, [step]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const path = `${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("chatbot-images").upload(path, file);
        if (uploadError) {
          toast("Erro ao enviar a foto.", "error");
          return;
        }
        const { data } = supabase.storage.from("chatbot-images").getPublicUrl(path);
        setWallImageUrl(data.publicUrl);
      } finally {
        setUploading(false);
      }
    },
    [toast]
  );

  const handleRestart = useCallback(() => {
    setStep(0);
    setAnswers({});
    setTextValue("");
    setWallImageUrl(null);
    setGeneratedImageUrl(null);
  }, []);

  const handleDrag = useCallback((clientX: number) => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setDividerPct(Math.min(95, Math.max(5, pct)));
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      handleDrag(e.clientX);
      const move = (ev: PointerEvent) => handleDrag(ev.clientX);
      const stop = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [handleDrag]
  );

  const answeredSteps = useMemo(
    () => STEPS.filter((s) => (s.type === "file" ? Boolean(wallImageUrl) : Boolean(answers[s.key]))).length,
    [answers, wallImageUrl]
  );

  return (
    <ConsolePage title="Gerador de Imagem" subtitle="Simulacao de instalacao com IA">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ConsoleCard className="flex min-h-[520px] flex-col">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/10 text-violet-300">
                <AirVent size={15} />
              </div>
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Assistente de Instalacao</h2>
            </div>
            <ConsoleStatus tone="slate">Pergunta {step + 1} de {STEPS.length}</ConsoleStatus>
          </div>

          {generatedImageUrl ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-[var(--text-muted)]">
              <Sparkles size={22} />
              <p className="text-[12px] font-medium">Simulacao gerada. Veja o resultado ao lado.</p>
              <ConsoleButton icon={RefreshCcw} onClick={handleRestart}>Comecar nova simulacao</ConsoleButton>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all"
                  style={{ width: `${(answeredSteps / STEPS.length) * 100}%` }}
                />
              </div>

              <p className="mt-6 text-[16px] font-bold text-[var(--text-primary)]">{current.question}</p>

              <div className="mt-5 flex-1">
                {current.type === "text" && (
                  <input
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleNext();
                    }}
                    placeholder="Digite sua resposta..."
                    className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
                  />
                )}

                {current.type === "file" && (
                  <div className="flex flex-col gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {wallImageUrl ? (
                      <div className="flex items-center gap-3 rounded-[8px] border border-emerald-500/30 bg-emerald-500/10 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={wallImageUrl} alt="Foto enviada" className="h-14 w-14 rounded-[6px] object-cover" />
                        <p className="text-[12px] font-semibold text-emerald-300">Foto enviada com sucesso.</p>
                      </div>
                    ) : (
                      <ConsoleButton
                        icon={uploading ? Loader2 : ImagePlus}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full justify-center"
                      >
                        {uploading ? "Enviando..." : "Selecionar foto"}
                      </ConsoleButton>
                    )}
                  </div>
                )}

                {current.type === "choice" && (
                  <div className="flex flex-wrap gap-2">
                    {current.options.map((opt) => (
                      <ConsoleButton
                        key={opt}
                        active={answers[current.key] === opt}
                        onClick={() => setAnswers((prev) => ({ ...prev, [current.key]: opt }))}
                      >
                        {opt}
                      </ConsoleButton>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-2">
                <ConsoleButton icon={ArrowLeft} onClick={handleBack} disabled={step === 0}>
                  Voltar
                </ConsoleButton>
                <ConsoleButton active onClick={handleNext} disabled={!answered || generating}>
                  {isLastStep ? "Gerar imagem" : "Proximo"}
                </ConsoleButton>
              </div>
            </div>
          )}
        </ConsoleCard>

        <div className="space-y-4">
          <ConsoleCard>
            {generating ? (
              <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
                <Loader2 size={22} className="animate-spin" />
                <p className="text-[12px] font-medium">Gerando visualizacao...</p>
              </div>
            ) : generatedImageUrl && wallImageUrl ? (
              <>
                <div
                  ref={compareRef}
                  className="relative h-[420px] select-none overflow-hidden rounded-[8px] border border-[var(--border)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={wallImageUrl} alt="Antes" className="absolute inset-0 h-full w-full object-cover" />
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={generatedImageUrl} alt="Depois" className="h-full w-full object-cover" />
                  </div>

                  <div
                    className="absolute inset-y-0 z-10 flex w-0 items-center justify-center"
                    style={{ left: `${dividerPct}%` }}
                  >
                    <div className="absolute inset-y-0 w-[2px] bg-blue-400/90" />
                    <button
                      onPointerDown={startDrag}
                      aria-label="Arrastar para comparar antes e depois"
                      className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-blue-500 text-white shadow-lg touch-none ${
                        dragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </div>

                  <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Antes</span>
                  <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold text-white">Depois</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <ConsoleButton icon={RefreshCcw} onClick={() => requestGeneration(answers)}>
                    Gerar outra versao
                  </ConsoleButton>
                  <ConsoleButton icon={MessageSquare} active>
                    Criar orcamento
                  </ConsoleButton>
                </div>
              </>
            ) : (
              <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--border-strong)] text-center text-[var(--text-muted)]">
                <Sparkles size={22} />
                <p className="max-w-[220px] text-[12px] font-medium">
                  Responda as perguntas ao lado pra gerar a visualizacao da instalacao.
                </p>
              </div>
            )}
          </ConsoleCard>
        </div>
      </div>
    </ConsolePage>
  );
}
