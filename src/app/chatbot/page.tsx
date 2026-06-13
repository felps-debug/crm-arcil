"use client";

import { useState, useRef, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Send, ImageIcon, Bot, User } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isImage?: boolean;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Olá! Sou o assistente de visualização da ARCIL. Envie uma foto do ambiente onde deseja instalar o ar-condicionado e me diga qual modelo está considerando.",
  },
];

const CANNED_RESPONSES = [
  "Entendi! Qual modelo de ar-condicionado você está considerando? (Ex: Split 12000 BTUs, Cassete 24000 BTUs)",
  "Perfeito! Vou gerar uma visualização de como o equipamento ficaria no ambiente. Aguarde um momento...",
  "Aqui está a visualização! O ar-condicionado foi posicionado na parede principal, considerando o fluxo de ar ideal para o ambiente.",
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [responding, setResponding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const responseIndex = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || responding) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setResponding(true);

    setTimeout(() => {
      const responseText = CANNED_RESPONSES[responseIndex.current % CANNED_RESPONSES.length];
      const isImageResponse = responseIndex.current % CANNED_RESPONSES.length === 2;

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseText,
        isImage: isImageResponse,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      responseIndex.current++;
      setResponding(false);
    }, 1200);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Gerador de Imagem" subtitle="Visualização de ar-condicionado com IA" />

      <main className="flex-1 px-6 py-6 max-w-[900px] mx-auto w-full flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                    <Bot size={18} className="text-white" />
                  </div>
                )}
                <div className="max-w-[75%] space-y-2">
                  <div
                    className={`px-5 py-3.5 rounded-2xl text-[14px] leading-relaxed ${
                      msg.role === "user"
                        ? "text-white rounded-br-md shadow-md"
                        : "bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)] rounded-bl-md shadow-sm"
                    }`}
                    style={msg.role === "user" ? { background: "linear-gradient(135deg, #2563eb, #1d4ed8)" } : undefined}
                  >
                    {msg.content}
                  </div>
                  {msg.isImage && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-8 flex flex-col items-center gap-3 shadow-sm">
                      <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center">
                        <ImageIcon size={28} className="text-slate-400" />
                      </div>
                      <p className="text-[13px] text-[var(--text-muted)]">Imagem gerada será exibida aqui</p>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-slate-600" />
                  </div>
                )}
              </div>
            ))}
            {responding && (
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                  <Bot size={18} className="text-white" />
                </div>
                <div className="px-5 py-4 rounded-2xl rounded-bl-md bg-[var(--bg-subtle)] border border-[var(--border)] shadow-sm">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse [animation-delay:150ms]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-[var(--border)] p-5" style={{ background: "var(--bg-subtle)" }}>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-3"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-5 py-3.5 rounded-xl border text-[14px] bg-white border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all shadow-sm"
                disabled={responding}
              />
              <button
                type="submit"
                disabled={!input.trim() || responding}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40 shadow-lg"
                style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </Card>
      </main>
    </div>
  );
}
