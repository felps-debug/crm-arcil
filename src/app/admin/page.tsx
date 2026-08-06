"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, KeyRound, MoreVertical, Plus, Shield, UserRound, Users, X } from "lucide-react";
import {
  ConsoleButton,
  ConsoleCard,
  ConsoleError,
  ConsoleInput,
  ConsoleLoading,
  ConsolePage,
  ConsoleStatus,
  ConsoleTable,
} from "@/components/console/console-shell";
import { AccessGuard } from "@/components/layout/access-guard";
import { formatDateTime, useApi } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import type { ActivityLogResponse } from "@/types/api";

type AdminUser = {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
  created_at?: string | null;
  permissions?: Record<string, boolean> | null;
  chatwoot_inbox_id?: string | null;
};

type ChatwootInboxesResponse = { inboxes: { id: number; name: string }[] };

const MODULE_PERMISSIONS: { key: string; label: string }[] = [
  { key: "manage_cobranca", label: "Cobranças" },
  { key: "manage_estoque", label: "Demanda & Estoque" },
  { key: "manage_gerador_imagem", label: "Gerador de Imagem" },
  { key: "manage_atendimento", label: "Atendimento (Chatwoot)" },
];

type UsersResponse = {
  users: AdminUser[];
};

const ROLES = ["superadmin", "owner", "manager", "vendor", "employee", "client"] as const;

const roleTone: Record<string, "blue" | "green" | "amber" | "red" | "violet" | "slate"> = {
  superadmin: "blue",
  owner: "red",
  manager: "violet",
  vendor: "green",
  employee: "amber",
  client: "slate",
};

const permissions = [
  ["Super Admin", "Acesso total a todas as funcoes e configuracoes.", "blue"],
  ["Dono", "Controle financeiro e administrativo total da conta.", "red"],
  ["Gerente", "Supervisao de equipes e relatorios operacionais.", "violet"],
  ["Vendedor", "Gestao de leads do funil de vendas atribuido.", "green"],
  ["Financeiro", "Acesso exclusivo ao faturamento e cobrancas.", "amber"],
  ["Estoque", "Controle de entrada e saida de materiais.", "slate"],
];

export default function AdminPage() {
  return (
    <AccessGuard superAdminOnly>
      <AdminPageInner />
    </AccessGuard>
  );
}

function AdminPageInner() {
  const { toast } = useToast();
  const [reloadToken, setReloadToken] = useState(0);
  const { data, loading, error } = useApi<UsersResponse>(`/api/admin/users?t=${reloadToken}`);
  const activity = useApi<ActivityLogResponse>(`/api/admin/activity?t=${reloadToken}`);
  // Errors silently (e.g. Chatwoot not configured yet) — the inbox picker
  // just doesn't render below rather than breaking the whole admin page.
  const inboxes = useApi<ChatwootInboxesResponse>("/api/atendimento/inboxes");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const users = useMemo(() => {
    const all = data?.users ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => (u.full_name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [data, search]);

  async function handleChangeRole(userId: string, role: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      toast(body.error ?? "Erro ao alterar papel.", "error");
      return;
    }
    toast("Papel atualizado.", "success");
    setReloadToken((t) => t + 1);
  }

  async function handleTogglePermission(user: AdminUser, key: string, value: boolean) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [key]: value } }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      toast(body.error ?? "Erro ao alterar permissao.", "error");
      return;
    }
    setReloadToken((t) => t + 1);
  }

  async function handleSetChatwootInbox(userId: string, chatwootInboxId: string | null) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatwoot_inbox_id: chatwootInboxId }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      toast(body.error ?? "Erro ao vincular número.", "error");
      return;
    }
    toast(chatwootInboxId ? "Número vinculado." : "Vínculo removido.", "success");
    setReloadToken((t) => t + 1);
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Remover este usuario definitivamente?")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok || body.error) {
      toast(body.error ?? "Erro ao remover usuario.", "error");
      return;
    }
    toast("Usuario removido.", "success");
    setReloadToken((t) => t + 1);
  }

  return (
    <ConsolePage
      title="Admin"
      subtitle="Configuracoes do sistema"
      actions={
        <ConsoleInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuarios..."
          aria-label="Buscar usuarios"
          className="w-full sm:w-64"
        />
      }
    >
      {loading && <ConsoleLoading />}
      {error && <ConsoleError message={error} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
          <ConsoleCard pad={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-blue-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Gerenciamento de Usuarios</h2>
              </div>
              <ConsoleButton icon={Plus} active onClick={() => setShowCreate(true)}>
                Criar usuario
              </ConsoleButton>
            </div>
            <ConsoleTable headers={["Nome / Email", "Cargo", "Ultimo acesso", ""]}>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-500/10 text-blue-300">
                        <UserRound size={14} />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{user.full_name ?? user.email}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><ConsoleStatus tone={roleTone[user.role ?? ""] ?? "slate"}>{user.role ?? "employee"}</ConsoleStatus></td>
                  <td className="px-3 py-3 font-data text-[var(--text-secondary)]">{formatDateTime(user.created_at)}</td>
                  <td className="px-3 py-3">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <ConsoleButton icon={MoreVertical} aria-label="Ações do usuário" />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={4}
                          className="z-20 w-56 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-lg)]"
                        >
                          <DropdownMenu.Label className="px-2 pb-1 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                            Alterar papel
                          </DropdownMenu.Label>
                          {ROLES.map((role) => (
                            <DropdownMenu.Item
                              key={role}
                              onSelect={() => handleChangeRole(user.id, role)}
                              className="block w-full cursor-pointer rounded-[6px] px-2 py-1.5 text-left text-[12px] font-medium text-[var(--text-secondary)] outline-none hover:bg-[var(--bg-subtle)] focus:bg-[var(--bg-subtle)]"
                            >
                              {role}
                            </DropdownMenu.Item>
                          ))}
                          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                          <DropdownMenu.Label className="px-2 pb-1 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                            Acesso a modulos
                          </DropdownMenu.Label>
                          {MODULE_PERMISSIONS.map((mod) => {
                            const checked = user.permissions?.[mod.key] === true;
                            return (
                              <DropdownMenu.CheckboxItem
                                key={mod.key}
                                checked={checked}
                                onCheckedChange={(value) => handleTogglePermission(user, mod.key, value)}
                                onSelect={(e) => e.preventDefault()}
                                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] outline-none hover:bg-[var(--bg-subtle)] focus:bg-[var(--bg-subtle)]"
                              >
                                <span className="grid h-3.5 w-3.5 place-items-center">
                                  <DropdownMenu.ItemIndicator>
                                    <Check size={12} />
                                  </DropdownMenu.ItemIndicator>
                                </span>
                                {mod.label}
                              </DropdownMenu.CheckboxItem>
                            );
                          })}
                          {!["superadmin", "owner", "manager"].includes(user.role ?? "") && inboxes.data?.inboxes && (
                            <>
                              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                              <DropdownMenu.Label className="px-2 pb-1 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                                Número Chatwoot (Atendimento)
                              </DropdownMenu.Label>
                              <div className="px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={user.chatwoot_inbox_id ?? ""}
                                  onChange={(e) => handleSetChatwootInbox(user.id, e.target.value || null)}
                                  className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
                                >
                                  <option value="">Nenhum vínculo</option>
                                  {inboxes.data.inboxes.map((ib) => (
                                    <option key={ib.id} value={String(ib.id)}>{ib.name}</option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                          <DropdownMenu.Item
                            onSelect={() => handleDeleteUser(user.id)}
                            className="block w-full cursor-pointer rounded-[6px] px-2 py-1.5 text-left text-[12px] font-bold text-red-400 outline-none hover:bg-red-500/10 focus:bg-red-500/10"
                          >
                            Remover usuario
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
            </ConsoleTable>
          </ConsoleCard>

          <div className="space-y-4">
            <ConsoleCard>
              <div className="flex items-center gap-2">
                <Shield size={15} className="text-violet-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Cargos e Permissoes</h2>
              </div>
              <div className="mt-4 space-y-3">
                {permissions.map(([name, description, tone]) => (
                  <div key={name} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
                    <ConsoleStatus tone={tone as "blue" | "green" | "amber" | "red" | "violet" | "slate"}>{name}</ConsoleStatus>
                    <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{description}</p>
                  </div>
                ))}
              </div>
            </ConsoleCard>

            <ConsoleCard>
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-amber-300" />
                <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Log de atividade</h2>
              </div>
              <div className="mt-4 space-y-2 text-[12px] text-[var(--text-secondary)]">
                {activity.loading && <p className="text-[var(--text-muted)]">Carregando...</p>}
                {!activity.loading && (activity.data?.items.length ?? 0) === 0 && (
                  <p className="text-[var(--text-muted)]">Nenhuma atividade registrada.</p>
                )}
                {activity.data?.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0">
                    <span>{item.action} — {item.entityType}</span>
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{formatDateTime(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            </ConsoleCard>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </ConsolePage>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("employee");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || !role) return;
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: fullName || null, role }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok || body.error) {
      toast(body.error ?? "Erro ao criar usuario.", "error");
      return;
    }
    toast("Usuario criado com sucesso.", "success");
    onCreated();
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 px-4" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-xl)] focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-bold text-[var(--text-primary)]">Criar usuario</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Fechar" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <ConsoleInput type="text" placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full" />
            <ConsoleInput type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full" />
            <ConsoleInput type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full" />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ConsoleButton type="submit" active className="w-full justify-center" disabled={saving}>
              {saving ? "Criando..." : "Criar usuario"}
            </ConsoleButton>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
