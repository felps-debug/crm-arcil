"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Clock,
  Download,
  History,
  ImagePlus,
  Loader2,
  MessageSquare,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleLoading,
  ConsolePage,
} from "@/components/console/console-shell";
import { AccessGuard } from "@/components/layout/access-guard";
import { createClient } from "@/lib/supabase/client";
import { getImageGenerationHistory, type ImageGeneration } from "@/lib/supabase/queries";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

async function downloadImage(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  imageUrl?: string;
}

type Step =
  | { key: string; question: string; type: "text" }
  | { key: string; question: string; type: "file" }
  | { key: string; question: string; type: "choice"; options: string[] };

const STEPS: Step[] = [
  { key: "ambiente", question: "Qual o ambiente da instalacao?", type: "text" },
  { key: "tipo_parede", question: "Qual o tipo da parede?", type: "choice", options: ["Alvenaria", "Drywall", "Outro"] },
  { key: "foto", question: "Envie uma foto da parede", type: "file" },
  { key: "modelo", question: "Qual o modelo do ar-condicionado?", type: "text" },
  { key: "pe_direito", question: "Qual a altura do pe-direito?", type: "text" },
  { key: "ponto_eletrico", question: "Ja existe ponto eletrico na parede?", type: "choice", options: ["Sim", "Nao"] },
  { key: "unidade_externa", question: "Onde ficara a unidade externa (condensadora) e a que distancia aproximada?", type: "text" },
  { key: "nivel_condensadora", question: "A condensadora fica acima, abaixo ou no mesmo nivel do ambiente?", type: "choice", options: ["Acima do ambiente", "Abaixo do ambiente", "Mesmo nivel do ambiente"] },
  { key: "tubulacao", question: "Tipo de tubulacao?", type: "choice", options: ["Embutida na parede", "Canaleta aparente", "Sem canaleta"] },
];

type Tab = "chat" | "historico";

export default function ChatbotPage() {
  return (
    <AccessGuard perm="manage_gerador_imagem">
      <ChatbotPageInner />
    </AccessGuard>
  );
}

function ChatbotPageInner() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>("chat");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<ChatMessage[]>([{ role: "assistant", content: STEPS[0].question }]);
  const [typing, setTyping] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [wallImageUrl, setWallImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [installationNotes, setInstallationNotes] = useState<string | null>(null);
  const [installationNotesSource, setInstallationNotesSource] = useState<"manual" | "ia" | null>(null);
  const [dividerPct, setDividerPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<{
    wallImageUrl: string | null;
    generatedImageUrl: string;
    installationNotes: string | null;
    installationNotesSource: "manual" | "ia" | null;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [historyItems, setHistoryItems] = useState<ImageGeneration[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryItems(await getImageGenerationHistory());
      setHistoryLoaded(true);
    } catch (e) {
      const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Erro ao carregar dados";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "historico" && !historyLoaded) void fetchHistory();
  }, [tab, historyLoaded, fetchHistory]);

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;
  const done = Boolean(generatedImageUrl);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, typing, generating, done]);

  const answered = current
    ? current.type === "file"
      ? Boolean(wallImageUrl)
      : current.type === "text"
        ? Boolean(textValue.trim())
        : false
    : false;

  const buildAnswersForApi = useCallback((finalAnswers: Record<string, string>): { role: "user" | "assistant"; content: string; imageUrl?: string }[] => {
    const messages: { role: "user" | "assistant"; content: string; imageUrl?: string }[] = [];
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
          body: JSON.stringify({ messages: buildAnswersForApi(finalAnswers), imageUrl: wallImageUrl, answers: finalAnswers }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Nao foi possivel gerar a imagem.", "error");
          return;
        }
        setGeneratedImageUrl(data.imageUrl);
        setInstallationNotes(data.installationNotes ?? null);
        setInstallationNotesSource(data.installationNotesSource ?? null);
        setDividerPct(50);
        setHistoryLoaded(false);
      } catch {
        toast("Erro de conexao ao gerar a imagem.", "error");
      } finally {
        setGenerating(false);
      }
    },
    [buildAnswersForApi, wallImageUrl, toast]
  );

  const handleDownload = useCallback(async () => {
    if (!generatedImageUrl) return;
    setDownloading(true);
    try {
      await downloadImage(generatedImageUrl, `simulacao-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloading(false);
    }
  }, [generatedImageUrl, toast]);

  const advance = useCallback(
    (nextAnswers: Record<string, string>, userBubble: ChatMessage) => {
      setTranscript((t) => [...t, userBubble]);
      setAnswers(nextAnswers);
      setTextValue("");

      if (isLastStep) {
        void requestGeneration(nextAnswers);
        return;
      }

      setTyping(true);
      const nextStep = STEPS[step + 1];
      setTimeout(() => {
        setTyping(false);
        setTranscript((t) => [...t, { role: "assistant", content: nextStep.question }]);
        setStep((s) => s + 1);
      }, 550);
    },
    [isLastStep, requestGeneration, step]
  );

  const handleSendText = useCallback(() => {
    if (!current || current.type !== "text" || !textValue.trim()) return;
    advance({ ...answers, [current.key]: textValue.trim() }, { role: "user", content: textValue.trim() });
  }, [current, textValue, answers, advance]);

  const handleChoice = useCallback(
    (opt: string) => {
      if (!current || current.type !== "choice") return;
      advance({ ...answers, [current.key]: opt }, { role: "user", content: opt });
    },
    [current, answers, advance]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !current || current.type !== "file") return;
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
        advance(answers, { role: "user", content: "Foto da parede enviada.", imageUrl: data.publicUrl });
      } finally {
        setUploading(false);
      }
    },
    [current, answers, advance, toast]
  );

  const handleRestart = useCallback(() => {
    setStep(0);
    setAnswers({});
    setTextValue("");
    setWallImageUrl(null);
    setGeneratedImageUrl(null);
    setInstallationNotes(null);
    setInstallationNotesSource(null);
    setTranscript([{ role: "assistant", content: STEPS[0].question }]);
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
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções do gerador de imagem">
        <ConsoleButton icon={MessageSquare} active={tab === "chat"} onClick={() => setTab("chat")} role="tab" aria-selected={tab === "chat"}>
          Nova simulacao
        </ConsoleButton>
        <ConsoleButton icon={History} active={tab === "historico"} onClick={() => setTab("historico")} role="tab" aria-selected={tab === "historico"}>
          Historico
          {historyItems.length > 0 && <span className="font-data opacity-80">{historyItems.length}</span>}
        </ConsoleButton>
      </div>

      {tab === "chat" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ConsoleCard className="flex h-[min(600px,70dvh)] flex-col" pad={false}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/10 text-violet-300">
                  <Sparkles size={15} />
                </div>
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Assistente de Instalacao</h2>
              </div>
              {!done && (
                <span className="font-data text-[11px] text-[var(--text-muted)]">{answeredSteps}/{STEPS.length}</span>
              )}
            </div>

            <div className="h-1 w-full overflow-hidden bg-[var(--bg-subtle)]">
              <div
                className="h-full bg-blue-400 transition-all"
                style={{ width: `${done ? 100 : (answeredSteps / STEPS.length) * 100}%` }}
              />
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {transcript.map((m, i) => (
                <ChatBubble key={i} message={m} />
              ))}
              {typing && <TypingBubble />}
              {generating && <TypingBubble label="Gerando a simulacao..." />}
              {done && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-[12px] rounded-tl-none border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-300">
                    Simulacao pronta! Veja o resultado ao lado.
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] p-3">
              {done ? (
                <ConsoleButton icon={RefreshCcw} onClick={handleRestart} className="w-full justify-center">
                  Comecar nova simulacao
                </ConsoleButton>
              ) : typing || generating ? (
                <div className="flex h-10 items-center justify-center text-[12px] text-[var(--text-muted)]">Aguarde...</div>
              ) : current.type === "text" ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendText();
                    }}
                    placeholder="Digite sua resposta..."
                    className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
                  />
                  <ConsoleButton active onClick={handleSendText} disabled={!answered}>
                    Enviar
                  </ConsoleButton>
                </div>
              ) : current.type === "file" ? (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  <ConsoleButton
                    icon={uploading ? Loader2 : ImagePlus}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    active
                    className="w-full justify-center"
                  >
                    {uploading ? "Enviando..." : "Selecionar foto"}
                  </ConsoleButton>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {current.options.map((opt) => (
                    <ConsoleButton key={opt} onClick={() => handleChoice(opt)} className="flex-1 justify-center">
                      {opt}
                    </ConsoleButton>
                  ))}
                </div>
              )}
            </div>
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
                  <div ref={compareRef} className="relative h-[420px] select-none overflow-hidden rounded-[8px] border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wallImageUrl} alt="Antes" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={generatedImageUrl} alt="Depois" className="h-full w-full object-cover" />
                    </div>

                    <div className="absolute inset-y-0 z-10 flex w-0 items-center justify-center" style={{ left: `${dividerPct}%` }}>
                      <div className="absolute inset-y-0 w-[2px] bg-blue-400/90" />
                      <button
                        onPointerDown={startDrag}
                        aria-label="Arrastar para comparar antes e depois"
                        className={`relative z-10 grid h-9 w-9 touch-none place-items-center rounded-full border border-white/40 bg-blue-500 text-white shadow-lg ${
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
                    <ConsoleButton icon={downloading ? Loader2 : Download} active onClick={handleDownload} disabled={downloading}>
                      {downloading ? "Baixando..." : "Baixar imagem"}
                    </ConsoleButton>
                  </div>

                  {installationNotes && <InstallationNotesCard notes={installationNotes} source={installationNotesSource} />}
                </>
              ) : (
                <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--border-strong)] text-center text-[var(--text-muted)]">
                  <Sparkles size={22} />
                  <p className="max-w-[220px] text-[12px] font-medium">Converse com o assistente pra gerar a visualizacao da instalacao.</p>
                </div>
              )}
            </ConsoleCard>
          </div>
        </div>
      ) : (
        <HistoricoTab loading={historyLoading} error={historyError} items={historyItems} onSelect={setPreviewItem} />
      )}

      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}
    </ConsolePage>
  );
}

function InstallationNotesCard({ notes, source }: { notes: string; source: "manual" | "ia" | null }) {
  return (
    <div className="mt-4 rounded-[10px] border border-amber-500/25 bg-amber-500/8 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber-400" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
          Nota de instalacao {source === "manual" ? "(manual do fabricante)" : "(gerada por IA)"}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{notes}</p>
      {source === "ia" && (
        <p className="mt-2 text-[10px] text-amber-400/80">Orientacao geral gerada por IA — confirme sempre no manual oficial do fabricante antes de instalar.</p>
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] ${
          isAssistant
            ? "rounded-tl-none border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text-primary)]"
            : "rounded-tr-none bg-blue-500 text-white"
        }`}
      >
        {message.content}
        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.imageUrl} alt="Enviada" className="mt-2 h-24 w-24 rounded-[6px] object-cover" />
        )}
      </div>
    </div>
  );
}

function TypingBubble({ label }: { label?: string }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-[12px] rounded-tl-none border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5">
        {label ? (
          <>
            <Loader2 size={13} className="animate-spin text-[var(--text-muted)]" />
            <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
          </>
        ) : (
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-muted)]"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function HistoricoTab({
  loading,
  error,
  items,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  items: ImageGeneration[];
  onSelect: (item: {
    wallImageUrl: string | null;
    generatedImageUrl: string;
    installationNotes: string | null;
    installationNotesSource: "manual" | "ia" | null;
  }) => void;
}) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;
  if (!items.length) {
    return (
      <ConsoleCard className="flex h-40 flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
        <Clock size={20} />
        <p className="text-[12px] font-medium">Nenhuma simulacao gerada ainda.</p>
      </ConsoleCard>
    );
  }

  async function handleCardDownload(e: React.MouseEvent, item: ImageGeneration) {
    e.stopPropagation();
    setDownloadingId(item.id);
    try {
      await downloadImage(item.generated_image_url, `simulacao-${item.id}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() =>
            onSelect({
              wallImageUrl: item.wall_image_url,
              generatedImageUrl: item.generated_image_url,
              installationNotes: item.installation_notes,
              installationNotesSource: item.installation_notes_source,
            })
          }
          className="text-left"
        >
          <ConsoleCard pad={false} className="overflow-hidden transition-colors hover:border-blue-500/50">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generated_image_url} alt="Simulacao gerada" className="h-36 w-full object-cover" />
              <button
                onClick={(e) => handleCardDownload(e, item)}
                disabled={downloadingId === item.id}
                aria-label="Baixar imagem"
                title="Baixar imagem"
                className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-[6px] bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-60"
              >
                {downloadingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-500/10 text-[9px] font-bold text-blue-300">
                  <User size={11} />
                </div>
                <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{item.user_name ?? "Desconhecido"}</p>
              </div>
              <p className="mt-1.5 font-data text-[11px] text-[var(--text-muted)]">{formatDateTime(item.created_at)}</p>
            </div>
          </ConsoleCard>
        </button>
      ))}
    </div>
  );
}

function PreviewModal({
  item,
  onClose,
}: {
  item: {
    wallImageUrl: string | null;
    generatedImageUrl: string;
    installationNotes: string | null;
    installationNotesSource: "manual" | "ia" | null;
  };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadImage(item.generatedImageUrl, `simulacao-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] focus:outline-none"
        >
          <Dialog.Title className="sr-only">Pré-visualização da simulação</Dialog.Title>
          <div className={`grid grid-cols-1 ${item.wallImageUrl ? "sm:grid-cols-2" : ""}`}>
            {item.wallImageUrl && (
              <div>
                <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Antes</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.wallImageUrl} alt="Antes" className="h-[260px] w-full object-cover p-3 pt-1 sm:h-[420px]" />
              </div>
            )}
            <div>
              <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Depois</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generatedImageUrl} alt="Depois" className="h-[260px] w-full object-cover p-3 pt-1 sm:h-[420px]" />
            </div>
          </div>
          {item.installationNotes && (
            <div className="px-3 pb-3">
              <InstallationNotesCard notes={item.installationNotes} source={item.installationNotesSource} />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-3">
            <ConsoleButton icon={downloading ? Loader2 : Download} active onClick={handleDownload} disabled={downloading}>
              {downloading ? "Baixando..." : "Baixar imagem"}
            </ConsoleButton>
            <Dialog.Close asChild>
              <ConsoleButton>Fechar</ConsoleButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
