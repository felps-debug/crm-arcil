"use client";

import { X, MessageSquare, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useApi, formatDateTime } from "@/lib/client-api";
import type { AgentConversationsResponse } from "@/types/api";

interface AgentConversationsDrawerProps {
  agentId: string | null;
  agentName: string | null;
  onClose: () => void;
}

export function AgentConversationsDrawer({ agentId, agentName, onClose }: AgentConversationsDrawerProps) {
  const { data, loading, error } = useApi<AgentConversationsResponse>(
    agentId ? `/api/agents/${agentId}/conversations` : null
  );

  return (
    <AnimatePresence>
      {agentId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-xl)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-blue-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Conversas — {agentName}</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading && <p className="text-[12px] text-[var(--text-muted)]">Carregando conversas...</p>}
              {error && <p className="text-[12px] text-red-300">{error}</p>}
              {!loading && !error && (data?.conversations.length ?? 0) === 0 && (
                <p className="text-[12px] text-[var(--text-muted)]">Nenhuma conversa registrada para este agente.</p>
              )}
              {data?.conversations.map((conv) => (
                <div key={conv.id} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold text-[var(--text-primary)]">{conv.leadName ?? "Lead sem nome"}</p>
                      {conv.leadPhone && (
                        <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                          <Phone size={10} /> {conv.leadPhone}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-[var(--text-muted)]">{formatDateTime(conv.startedAt)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {conv.messages.length === 0 && (
                      <p className="text-[11px] text-[var(--text-muted)]">Sem mensagens registradas.</p>
                    )}
                    {conv.messages.map((m) => (
                      <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-[8px] border px-2.5 py-1.5 text-[11px] ${
                            m.role === "user"
                              ? "border-blue-500/40 bg-blue-500/20 text-blue-100"
                              : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
