"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  History,
  ImagePlus,
  Loader2,
  RefreshCcw,
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
import type { TipoEquipamento } from "./_components/produto-picker";
import { MarcadorInstalacao } from "./_components/marcador-instalacao";
import { GroupForm } from "./_components/group-form";
import { ResultadoPainel, InstallationNotesCard, type Versao, type Posicionamento } from "./_components/resultado-painel";
import { buildSteps, buildStepGroups, grupoRespondido, type StepGroup } from "./_components/step-groups";
import { parseMarcacao, type Marcacao } from "@/lib/marcacao";
import type { InventoryProduct } from "@/types/api";

/**
 * Nome de arquivo aceito como chave do Supabase Storage.
 *
 * O nome vinha direto do arquivo escolhido pelo vendedor, e no Brasil ele
 * costuma ter acento, espaco e parenteses ("Foto da sala (1).jpeg",
 * "WhatsApp Image 2026-08-27 as 10.30.11.jpeg"). O Storage recusa a chave e o
 * upload falhava com um toast generico — o vendedor via "erro ao enviar a
 * foto" sem nenhuma pista de que o problema era o nome do proprio arquivo.
 *
 * O uuid na frente ja garante unicidade, entao aqui basta reduzir o resto ao
 * que o Storage aceita, preservando a extensao.
 */
function nomeSeguroDeArquivo(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return limpo.slice(-80) || "foto.jpg";
}

/**
 * Reduz a foto no navegador antes de subir.
 *
 * Dois motivos, os dois com consequencia real:
 *
 * 1. O bucket `chatbot-images` recusa arquivo acima de 10 MB, e foto de celular
 *    moderno passa disso com facilidade.
 * 2. Essa mesma foto viaja em base64 dentro do corpo do webhook do n8n (e de
 *    novo na imagem-guia). Cada MB aqui vira ~1,37 MB de payload, duas vezes.
 *
 * 2000 px no maior lado e mais que suficiente: o Gemini recebe a cena
 * redimensionada de qualquer forma, e a camada tecnica e vetorial.
 */
const LADO_MAXIMO = 2000;

async function comprimirFoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return file;
    if (blob.size >= file.size && escala === 1) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("[chatbot] nao consegui comprimir a foto, subindo original:", err);
    return file;
  }
}

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

type ApiMessage = { role: "assistant" | "user"; content: string; imageUrl?: string };
type Tab = "nova" | "historico";

/** O que a tela precisa para reabrir — e retomar — uma geração antiga. */
type ItemPreview = {
  wallImageUrl: string | null;
  generatedImageUrl: string;
  installationNotes: string | null;
  installationNotesSource: "manual" | "ia" | null;
  answers: Record<string, unknown> | null;
};

/** Chaves fixas dos 2 primeiros grupos (Ambiente e aparelho): sobrevivem a
 *  uma troca de tipo de equipamento porque não dependem de qual ramo é. Toda
 *  outra chave é "técnica" — pertence a algum ramo específico e precisa ser
 *  descartada se o vendedor voltar e trocar o aparelho por um de tipo
 *  diferente (senão um valor como "tubulacao" fica pendurado pra uma Janela,
 *  que não pergunta isso, e contamina o que vai pro n8n). */
const CHAVES_FIXAS = new Set(["ambiente", "produto", "codigo_erp", "sku", "marca", "modelo", "tipo_equipamento", "foto", "marcacao"]);

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

  const [tab, setTab] = useState<Tab>("nova");
  const [grupoIndex, setGrupoIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [wallImageUrl, setWallImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoAtiva, setVersaoAtiva] = useState(0);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [marcacao, setMarcacao] = useState<Marcacao | null>(null);
  const [condensadoraTipo, setCondensadoraTipo] = useState<"telhado" | "laje_tecnica" | "sacada_tecnica" | null>(null);
  const [condensadoraLoading, setCondensadoraLoading] = useState(false);
  const [condensadoraImageUrl, setCondensadoraImageUrl] = useState<string | null>(null);
  const [downloadingCondensadora, setDownloadingCondensadora] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [previewItem, setPreviewItem] = useState<ItemPreview | null>(null);
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

  const grupos = useMemo(() => buildStepGroups(answers.tipo_equipamento ?? null), [answers.tipo_equipamento]);
  const grupoAtual: StepGroup | undefined = grupos[grupoIndex];
  const questionarioConcluido = grupoIndex >= grupos.length;
  const isFoto = grupoAtual?.titulo === "Foto";
  const isMarcacao = grupoAtual?.titulo === "Marcação";
  const isTelaCheia = isFoto || isMarcacao;

  // Reseta o rascunho toda vez que muda de grupo — populado a partir de
  // `answers` pra reabrir com os valores certos quando o vendedor aperta
  // "Voltar" e reedita. Depende só de `grupoIndex` de propósito: só interessa
  // o instante em que o grupo troca, não cada vez que `answers` muda por
  // outro motivo (isso re-rodaria o reset e apagaria o que acabou de digitar).
  useEffect(() => {
    if (!grupoAtual || isTelaCheia) return;
    const inicial: Record<string, string> = {};
    for (const s of grupoAtual.steps) inicial[s.key] = answers[s.key] ?? "";
    setRascunho(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoIndex]);

  const buildAnswersForApi = useCallback(
    (finalAnswers: Record<string, string>): ApiMessage[] => {
      const messages: ApiMessage[] = [];
      for (const s of buildSteps(finalAnswers.tipo_equipamento ?? null)) {
        messages.push({ role: "assistant", content: s.question });
        if (s.type === "file") {
          messages.push({ role: "user", content: "Foto enviada.", imageUrl: wallImageUrl ?? undefined });
        } else if (s.type === "marcacao") {
          messages.push({ role: "user", content: finalAnswers.marcacao ?? "Marcacao pulada." });
        } else {
          messages.push({ role: "user", content: finalAnswers[s.key] ?? "" });
        }
      }
      return messages;
    },
    [wallImageUrl]
  );

  const requestGeneration = useCallback(
    async (finalAnswers: Record<string, string>, revision?: { referenceImageUrl?: string; revisionPrompt?: string }) => {
      setGenerating(true);
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: buildAnswersForApi(finalAnswers),
            imageUrl: wallImageUrl,
            answers: finalAnswers,
            referenceImageUrl: revision?.referenceImageUrl,
            revisionPrompt: revision?.revisionPrompt,
            marcacao,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Não foi possível gerar a imagem.", "error");
          return;
        }
        setVersoes((atuais) => {
          const proximas = [
            ...atuais,
            {
              imageUrl: data.imageUrl as string,
              notes: (data.installationNotes as string | null) ?? null,
              notesSource: (data.installationNotesSource as "manual" | "ia" | null) ?? null,
              posicionamento: (data.posicionamento as Posicionamento | null) ?? null,
              origem: revision?.revisionPrompt ? ("ajuste" as const) : ("geracao" as const),
            },
          ];
          setVersaoAtiva(proximas.length - 1);
          return proximas;
        });
        setRevisionPrompt("");
        setHistoryLoaded(false);
      } catch {
        toast("Erro de conexao ao gerar a imagem.", "error");
      } finally {
        setGenerating(false);
      }
    },
    [buildAnswersForApi, wallImageUrl, marcacao, toast]
  );

  // Dispara a geração automaticamente assim que o último grupo é confirmado —
  // só na primeira vez (`versoes.length === 0`); repetir a geração depois é
  // uma ação explícita do botão "Gerar outra versao". Depende só de
  // `questionarioConcluido` de propósito, mesmo motivo do reset de rascunho
  // acima: sem isto reexecutaria a cada render que também mexe em `answers`.
  useEffect(() => {
    if (questionarioConcluido && versoes.length === 0 && !generating) {
      void requestGeneration(answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionarioConcluido]);

  const requestRevision = useCallback(() => {
    const atual = versoes[versaoAtiva]?.imageUrl;
    if (!atual || !revisionPrompt.trim() || generating) return;
    void requestGeneration(answers, { referenceImageUrl: atual, revisionPrompt: revisionPrompt.trim() });
  }, [answers, versoes, versaoAtiva, generating, requestGeneration, revisionPrompt]);

  const gerarCondensadora = useCallback(
    async (tipo: "telhado" | "laje_tecnica" | "sacada_tecnica") => {
      setCondensadoraTipo(tipo);
      setCondensadoraLoading(true);
      setCondensadoraImageUrl(null);
      try {
        const res = await fetch("/api/generate-image/condensadora-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipoLocal: tipo, productImageUrl, distanciaTexto: answers.unidade_externa || null }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast(data.error ?? "Não foi possível gerar a opção de local.", "error");
          return;
        }
        setCondensadoraImageUrl(data.imageUrl);
      } catch {
        toast("Erro de conexao ao gerar a opção de local.", "error");
      } finally {
        setCondensadoraLoading(false);
      }
    },
    [productImageUrl, answers.unidade_externa, toast]
  );

  const handleDownloadCondensadora = useCallback(async () => {
    if (!condensadoraImageUrl) return;
    setDownloadingCondensadora(true);
    try {
      await downloadImage(condensadoraImageUrl, `local-condensadora-${condensadoraTipo ?? "opcao"}-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloadingCondensadora(false);
    }
  }, [condensadoraImageUrl, condensadoraTipo, toast]);

  const handleDownload = useCallback(async () => {
    const url = versoes[versaoAtiva]?.imageUrl;
    if (!url) return;
    setDownloading(true);
    try {
      await downloadImage(url, `simulacao-${Date.now()}.jpg`);
    } catch {
      toast("Erro ao baixar a imagem.", "error");
    } finally {
      setDownloading(false);
    }
  }, [versoes, versaoAtiva, toast]);

  const handleSubmitGroup = useCallback((patch: Record<string, string>) => {
    setAnswers((atual) => {
      const tipoMudou = Boolean(patch.tipo_equipamento) && Boolean(atual.tipo_equipamento) && patch.tipo_equipamento !== atual.tipo_equipamento;
      if (!tipoMudou) return { ...atual, ...patch };
      const preservado = Object.fromEntries(Object.entries(atual).filter(([k]) => CHAVES_FIXAS.has(k)));
      return { ...preservado, ...patch };
    });
    setGrupoIndex((i) => i + 1);
  }, []);

  const handleVoltar = useCallback(() => setGrupoIndex((i) => Math.max(0, i - 1)), []);

  const handleRascunhoProduto = useCallback((produto: InventoryProduct, tipo: string) => {
    setProductImageUrl(produto.imageUrl ?? null);
    setRascunho((r) => ({
      ...r,
      produto: `${produto.name} (${produto.sku ?? produto.erpCode})`,
      codigo_erp: produto.erpCode ?? "",
      sku: produto.sku ?? "",
      marca: produto.brand ?? "",
      modelo: produto.name ?? "",
      tipo_equipamento: tipo,
    }));
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const arquivo = await comprimirFoto(file);
        const path = `${crypto.randomUUID()}-${nomeSeguroDeArquivo(arquivo.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("chatbot-images")
          .upload(path, arquivo, { contentType: arquivo.type || "image/jpeg" });
        if (uploadError) {
          console.error("[chatbot] upload da foto falhou:", uploadError);
          toast(`Erro ao enviar a foto: ${uploadError.message}`, "error");
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

  const handleConfirmarMarcacao = useCallback(
    (m: Marcacao) => {
      setMarcacao(m);
      setAnswers((a) => ({
        ...a,
        marcacao: "Aparelho marcado na foto" + (m.rota.length >= 2 ? ", tubulação desenhada." : "."),
      }));
      setGrupoIndex((i) => i + 1);
    },
    []
  );

  const handlePularMarcacao = useCallback(() => {
    setMarcacao(null);
    setAnswers((a) => ({ ...a, marcacao: "Marcacao pulada." }));
    setGrupoIndex((i) => i + 1);
  }, []);

  const retomarDoHistorico = useCallback((item: ItemPreview) => {
    const respostas = (item.answers ?? {}) as Record<string, unknown>;
    const texto: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(respostas)) {
      if (typeof valor === "string") texto[chave] = valor;
      else if (typeof valor === "boolean") texto[chave] = valor ? "Sim" : "Não";
    }
    const marcacaoSalva = parseMarcacao(respostas.marcacao);

    setAnswers(texto);
    setMarcacao(marcacaoSalva);
    setWallImageUrl(item.wallImageUrl);
    setVersoes([
      {
        imageUrl: item.generatedImageUrl,
        notes: item.installationNotes,
        notesSource: item.installationNotesSource,
        posicionamento: null,
        origem: "geracao",
      },
    ]);
    setVersaoAtiva(0);
    setGrupoIndex(buildStepGroups(texto.tipo_equipamento ?? null).length);
    setPreviewItem(null);
    setTab("nova");
  }, []);

  const handleRestart = useCallback(() => {
    setGrupoIndex(0);
    setAnswers({});
    setRascunho({});
    setWallImageUrl(null);
    setMarcacao(null);
    setVersoes([]);
    setVersaoAtiva(0);
  }, []);

  return (
    <ConsolePage title="Gerador de Imagem" subtitle="Simulação de instalação com IA">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções do gerador de imagem">
        <ConsoleButton icon={Sparkles} active={tab === "nova"} onClick={() => setTab("nova")} role="tab" aria-selected={tab === "nova"}>
          Nova simulacao
        </ConsoleButton>
        <ConsoleButton icon={History} active={tab === "historico"} onClick={() => setTab("historico")} role="tab" aria-selected={tab === "historico"}>
          Histórico
          {historyItems.length > 0 && <span className="font-data opacity-80">{historyItems.length}</span>}
        </ConsoleButton>
      </div>

      {tab === "nova" ? (
        questionarioConcluido ? (
          <div className="space-y-3">
            {versoes.length > 0 && (
              <div className="flex justify-end">
                <ConsoleButton icon={RefreshCcw} onClick={handleRestart}>
                  Começar nova simulação
                </ConsoleButton>
              </div>
            )}
            <ResultadoPainel
              generating={generating}
              wallImageUrl={wallImageUrl}
              versoes={versoes}
              versaoAtiva={versaoAtiva}
              onSelecionarVersao={setVersaoAtiva}
              onGerarOutraVersao={() => requestGeneration(answers)}
              onDownload={handleDownload}
              downloading={downloading}
              revisionPrompt={revisionPrompt}
              onChangeRevisionPrompt={setRevisionPrompt}
              onGerarAjuste={requestRevision}
              condensadoraTipo={condensadoraTipo}
              condensadoraLoading={condensadoraLoading}
              condensadoraImageUrl={condensadoraImageUrl}
              downloadingCondensadora={downloadingCondensadora}
              onGerarCondensadora={gerarCondensadora}
              onDownloadCondensadora={handleDownloadCondensadora}
            />
          </div>
        ) : grupoAtual ? (
          <ConsoleCard pad={false} className="flex min-h-[min(680px,80dvh)] flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                {grupoIndex > 0 && (
                  <button
                    onClick={handleVoltar}
                    aria-label="Voltar"
                    className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">{grupoAtual.titulo}</h2>
              </div>
              <span className="font-data text-[11px] text-[var(--text-muted)]">
                {grupoIndex + 1}/{grupos.length}
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden bg-[var(--bg-subtle)]">
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${(grupoIndex / grupos.length) * 100}%` }} />
            </div>

            <div className={isTelaCheia ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto p-4"}>
              {isFoto ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  <ConsoleButton
                    icon={uploading ? Loader2 : ImagePlus}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    active
                    className="w-full max-w-xs justify-center"
                  >
                    {uploading ? "Enviando..." : wallImageUrl ? "Trocar foto" : "Selecionar foto"}
                  </ConsoleButton>
                  {wallImageUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={wallImageUrl} alt="Foto enviada" className="max-h-[320px] rounded-[8px] border border-[var(--border)] object-contain" />
                      <ConsoleButton icon={Check} active onClick={() => setGrupoIndex((i) => i + 1)} className="w-full max-w-xs justify-center">
                        Continuar
                      </ConsoleButton>
                    </>
                  )}
                </div>
              ) : isMarcacao ? (
                wallImageUrl ? (
                  <MarcadorInstalacao
                    fotoUrl={wallImageUrl}
                    tipo={(answers.tipo_equipamento as TipoEquipamento | undefined) ?? null}
                    onConfirm={handleConfirmarMarcacao}
                    onSkip={handlePularMarcacao}
                    disabled={generating}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <ConsoleButton onClick={handlePularMarcacao} className="w-full max-w-xs justify-center">
                      Continuar sem marcacao
                    </ConsoleButton>
                  </div>
                )
              ) : (
                <GroupForm
                  grupo={grupoAtual}
                  answers={rascunho}
                  onChangeAnswer={(chave, valor) => setRascunho((r) => ({ ...r, [chave]: valor }))}
                  onConfirmProduto={handleRascunhoProduto}
                  disabled={generating}
                />
              )}
            </div>

            {!isTelaCheia && (
              <div className="flex justify-end border-t border-[var(--border)] p-3">
                <ConsoleButton
                  active
                  disabled={!grupoRespondido(grupoAtual, rascunho, { temFoto: true, marcacaoRespondida: true })}
                  onClick={() => handleSubmitGroup(rascunho)}
                >
                  Continuar
                </ConsoleButton>
              </div>
            )}
          </ConsoleCard>
        ) : null
      ) : (
        <HistóricoTab loading={historyLoading} error={historyError} items={historyItems} onSelect={setPreviewItem} />
      )}

      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} onContinuar={retomarDoHistorico} />}
    </ConsolePage>
  );
}

function HistóricoTab({
  loading,
  error,
  items,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  items: ImageGeneration[];
  onSelect: (item: ItemPreview) => void;
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
              answers: item.answers,
            })
          }
          className="text-left"
        >
          <ConsoleCard pad={false} className="overflow-hidden transition-colors hover:border-blue-500/50">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generated_image_url} alt="Simulação gerada" className="h-36 w-full object-cover" />
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
  onContinuar,
}: {
  item: ItemPreview;
  onClose: () => void;
  onContinuar: (item: ItemPreview) => void;
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] focus:outline-none">
          <Dialog.Title className="sr-only">Pré-visualização da simulação</Dialog.Title>
          <div className={`grid grid-cols-1 ${item.wallImageUrl ? "sm:grid-cols-2" : ""}`}>
            {item.wallImageUrl && (
              <div>
                <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Antes</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.wallImageUrl} alt="Antes" className="h-[260px] w-full object-contain p-3 pt-1 sm:h-[420px]" />
              </div>
            )}
            <div>
              <span className="block px-3 pt-3 text-[10px] font-bold uppercase text-[var(--text-muted)]">Depois</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.generatedImageUrl} alt="Depois" className="h-[260px] w-full object-contain p-3 pt-1 sm:h-[420px]" />
            </div>
          </div>
          {item.installationNotes && (
            <div className="px-3 pb-3">
              <InstallationNotesCard notes={item.installationNotes} source={item.installationNotesSource} />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-3">
            <ConsoleButton icon={RefreshCcw} onClick={() => onContinuar(item)}>
              Retomar e ajustar
            </ConsoleButton>
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
