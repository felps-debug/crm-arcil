"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import {
  Send, Paperclip, X, Download, Loader2, RotateCcw,
  ZoomIn, Bot, History, ImageIcon, MessageSquare, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  generatedImageUrl?: string;
  isGenerating?: boolean;
  timestamp: string; // ISO string for JSON serialisation
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface Session {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  generatedImageUrl?: string;
}

const STORAGE_KEY = "arcil_chatbot_sessions";
const MAX_SESSIONS = 30;

const INITIAL_MESSAGE: ChatMessage = {
  id: "init",
  role: "assistant",
  content: "Olá! Sou o consultor de visualização da ARCIL. Para começar, me manda uma foto da parede onde o ar-condicionado será instalado — pode usar o ícone de clipe.",
  timestamp: new Date().toISOString(),
};

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {}
}

function sessionTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.content);
  if (first?.content) return first.content.slice(0, 45) + (first.content.length > 45 ? "…" : "");
  return "Conversa sem título";
}

function sessionThumb(messages: ChatMessage[]): string | undefined {
  return [...messages].reverse().find((m) => m.generatedImageUrl)?.generatedImageUrl;
}

function toApiMessages(msgs: ChatMessage[]): ApiMessage[] {
  return msgs
    .filter((m) => !m.isGenerating)
    .map((m) => ({ role: m.role, content: m.content, imageUrl: m.imageUrl }));
}

function TypingIndicator() {
  return (
    <div className="flex gap-1.5 items-center px-1 py-1">
      {[0, 0.18, 0.36].map((delay, i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: "var(--text-muted)" }}
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay }}
        />
      ))}
    </div>
  );
}

function BotAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm"
      style={{ background: "linear-gradient(135deg, #1c1c1e, #3a3a3c)" }}
    >
      <Bot size={14} className="text-white" />
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `s-${Date.now()}`);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [input, setInput] = useState("");
  const [responding, setResponding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedImageUrl, setStagedImageUrl] = useState<string | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => { setSessions(loadSessions()); }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, responding, scrollToBottom]);

  // Persist current session whenever messages change (debounced-ish via useEffect)
  useEffect(() => {
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (!hasUserMessage) return;
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === currentSessionId);
      const updated: Session = {
        id: currentSessionId,
        title: sessionTitle(messages),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        messages,
        generatedImageUrl: sessionThumb(messages),
      };
      const rest = prev.filter((s) => s.id !== currentSessionId);
      const next = [updated, ...rest];
      saveSessions(next);
      return next;
    });
  }, [messages, currentSessionId]);

  const triggerGeneration = useCallback(async (allMessages: ChatMessage[]) => {
    const genId = `gen-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: genId, role: "assistant", content: "Perfeito! Estou gerando a visualização agora, pode levar alguns instantes...", isGenerating: true, timestamp: new Date().toISOString() },
    ]);

    try {
      const latestImageUrl = [...allMessages].reverse().find((m) => m.imageUrl)?.imageUrl;
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(allMessages), imageUrl: latestImageUrl }),
      });
      if (!res.ok) throw new Error();
      const { imageUrl } = await res.json();
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === genId
            ? { ...m, isGenerating: false, content: "Pronto! Aqui está a visualização da instalação:", generatedImageUrl: imageUrl }
            : m
        );
        return [...updated, {
          id: `followup-${Date.now()}`,
          role: "assistant" as const,
          content: "Gostou? Se quiser ajustar algo ou gerar uma nova versão é só me falar!",
          timestamp: new Date().toISOString(),
        }];
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === genId ? { ...m, isGenerating: false, content: "Ocorreu um erro ao gerar a visualização. Tente novamente." } : m)
      );
    }
  }, []);

  async function handleSend() {
    if ((!input.trim() && !stagedImageUrl) || responding || uploading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: input.trim() || (stagedImageUrl ? "Segue a foto da parede." : ""),
      imageUrl: stagedImageUrl ?? undefined,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setStagedImageUrl(null);
    setStagedPreview(null);
    setResponding(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(updatedMessages) }),
      });
      if (!res.ok) throw new Error();
      const { message, readyToGenerate } = await res.json();

      const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: message, timestamp: new Date().toISOString() };
      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);

      if (readyToGenerate) { setResponding(false); triggerGeneration(finalMessages); return; }
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Ocorreu um erro. Tente novamente.", timestamp: new Date().toISOString() }]);
    } finally {
      setResponding(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => setStagedPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("chatbot-images").upload(filename, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("chatbot-images").getPublicUrl(filename);
      setStagedImageUrl(publicUrl);
    } catch (err) {
      setStagedPreview(null); setStagedImageUrl(null);
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: `Erro ao enviar imagem: ${err instanceof Error ? err.message : "tente novamente."}`, timestamp: new Date().toISOString() }]);
    } finally {
      setUploading(false);
    }
  }

  function handleReset() {
    const newId = `s-${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date().toISOString() }]);
    setInput(""); setStagedImageUrl(null); setStagedPreview(null);
    setResponding(false); setUploading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleLoadSession(session: Session) {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setInput(""); setStagedImageUrl(null); setStagedPreview(null);
    setResponding(false); setUploading(false);
    setTimeout(() => scrollToBottom(), 80);
  }

  function handleDeleteSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === currentSessionId) handleReset();
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <Header title="Gerador de Imagem" subtitle="Visualização de instalação de AC com IA" />

      <main className="flex-1 flex min-h-0 px-3 sm:px-4 py-3 sm:py-4 gap-4 max-w-[1280px] mx-auto w-full">

        {/* ── Chat panel ─────────────────────────────── */}
        <div
          className="flex-1 flex flex-col min-h-0 rounded-2xl border border-[var(--border)] overflow-hidden"
          style={{ background: "var(--bg-surface)", boxShadow: "var(--shadow-md)" }}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}
          >
            <div className="flex items-center gap-2.5">
              <BotAvatar />
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-none">Consultor ARCIL</p>
                <p className="text-[11px] text-emerald-500 mt-0.5 font-medium">Online</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <RotateCcw size={12} />
              Nova conversa
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 min-h-0">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && <BotAvatar />}

                  <div className={`max-w-[72%] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    {msg.imageUrl && (
                      <div className="rounded-2xl overflow-hidden border border-[var(--border)] shadow-sm max-w-[220px]">
                        <img src={msg.imageUrl} alt="Foto enviada" className="w-full max-h-48 object-cover" />
                      </div>
                    )}

                    {msg.content && (
                      <div
                        className={`px-4 py-2.5 text-[13.5px] leading-relaxed ${
                          msg.role === "user" ? "chat-bubble-user text-white" : "chat-bubble-assistant text-[var(--text-primary)]"
                        }`}
                      >
                        {msg.isGenerating ? (
                          <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <Loader2 size={13} className="animate-spin shrink-0" />
                            {msg.content}
                          </span>
                        ) : msg.content}
                      </div>
                    )}

                    {msg.generatedImageUrl && (
                      <div className="rounded-2xl overflow-hidden border border-[var(--border)] shadow-sm w-full max-w-[320px]">
                        <div className="relative cursor-zoom-in group" onClick={() => setPreviewModal(msg.generatedImageUrl!)}>
                          <img src={msg.generatedImageUrl} alt="Visualização gerada" className="w-full max-h-60 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2" style={{ background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
                          <button onClick={() => setPreviewModal(msg.generatedImageUrl!)} className="flex items-center gap-1 text-[11px] text-[var(--blue)] font-medium">
                            <ZoomIn size={11} /> Ver prévia
                          </button>
                          <a href={msg.generatedImageUrl} download="visualizacao-arcil.jpg" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                            <Download size={11} /> Baixar
                          </a>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-[var(--text-muted)] px-1">{formatTime(msg.timestamp)}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {responding && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex gap-2.5 justify-start"
                >
                  <BotAvatar />
                  <div className="chat-bubble-assistant px-4 py-3">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Staged image preview */}
          <AnimatePresence>
            {stagedPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="shrink-0 overflow-hidden"
              >
                <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
                  <div className="relative shrink-0">
                    <img src={stagedPreview} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-[var(--border)]" />
                    {uploading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                        <Loader2 size={12} className="text-white animate-spin" />
                      </div>
                    ) : (
                      <button onClick={() => { setStagedPreview(null); setStagedImageUrl(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shadow">
                        <X size={8} className="text-white" />
                      </button>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {uploading ? "Enviando imagem..." : "Pronto para enviar"}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input bar */}
          <div className="shrink-0 px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={responding || uploading || !!stagedImageUrl}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--blue)] hover:bg-blue-500/8 transition-all disabled:opacity-40 shrink-0"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={stagedImageUrl ? "Adicione uma mensagem..." : "Mensagem..."}
                className="flex-1 px-4 py-2.5 rounded-xl border text-[13.5px] border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-blue-500/8 transition-all"
                disabled={responding}
              />
              <button
                type="submit"
                disabled={(!input.trim() && !stagedImageUrl) || responding || uploading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40 shrink-0 hover:opacity-90"
                style={{ background: "var(--blue)" }}
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>

        {/* ── History panel ───────────────────────────── */}
        <div
          className="hidden lg:flex w-64 shrink-0 flex-col min-h-0 rounded-2xl border border-[var(--border)] overflow-hidden"
          style={{ background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
        >
          {/* Panel header */}
          <div
            className="flex items-center gap-2 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}
          >
            <History size={14} className="text-[var(--text-muted)]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Histórico</p>
            {sessions.length > 0 && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border)]">
                {sessions.length}
              </span>
            )}
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center">
                  <MessageSquare size={16} className="text-[var(--text-muted)]" />
                </div>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                  As conversas aparecerão aqui automaticamente
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {sessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  return (
                    <motion.button
                      key={session.id}
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => handleLoadSession(session)}
                      className={`w-full text-left rounded-xl p-3 transition-all group relative ${
                        isActive
                          ? "bg-[var(--bg-subtle)] border border-[var(--border-strong)]"
                          : "hover:bg-[var(--bg-subtle)] border border-transparent"
                      }`}
                    >
                      {/* Thumbnail or icon */}
                      <div className="flex items-start gap-2.5">
                        {session.generatedImageUrl ? (
                          <img
                            src={session.generatedImageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[var(--border)]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[var(--bg-base)] border border-[var(--border)] flex items-center justify-center shrink-0">
                            {session.messages.some((m) => m.imageUrl) ? (
                              <ImageIcon size={14} className="text-[var(--text-muted)]" />
                            ) : (
                              <MessageSquare size={14} className="text-[var(--text-muted)]" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
                            {session.title}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {formatDate(session.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500"
                        title="Apagar"
                      >
                        <Trash2 size={10} />
                      </button>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clear all */}
          {sessions.length > 0 && (
            <div
              className="shrink-0 px-3 py-2.5"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => {
                  setSessions([]);
                  saveSessions([]);
                  handleReset();
                }}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-red-500 transition-colors py-1 rounded-lg hover:bg-red-500/5"
              >
                <Trash2 size={10} />
                Limpar histórico
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Preview modal */}
      <AnimatePresence>
        {previewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={previewModal} alt="Visualização completa" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
              <button onClick={() => setPreviewModal(null)} className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-50 transition-colors">
                <X size={14} />
              </button>
              <a href={previewModal} download="visualizacao-arcil.jpg" target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl text-[12px] font-medium shadow-lg hover:bg-slate-50 transition-colors" onClick={(e) => e.stopPropagation()}>
                <Download size={12} /> Baixar
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
