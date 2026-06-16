"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { Badge } from "@/components/ui/badge";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  ShieldCheck, UserPlus, Users, Pencil, Trash2, X, Eye, EyeOff, Loader2,
} from "lucide-react";

type UserRole = "superadmin" | "owner" | "manager" | "vendor" | "employee" | "client";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  owner:      "Dono",
  manager:    "Gerente",
  vendor:     "Vendedor",
  employee:   "Funcionário",
  client:     "Cliente",
};

const ROLE_BADGE: Record<UserRole, "danger" | "info" | "success" | "warning" | "default"> = {
  superadmin: "danger",
  owner:      "info",
  manager:    "success",
  vendor:     "warning",
  employee:   "default",
  client:     "default",
};

const ALL_ROLES: UserRole[] = ["superadmin", "owner", "manager", "vendor", "employee", "client"];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        {...props}
        className="w-full px-3.5 py-2.5 rounded-xl border text-[13.5px] bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl border text-[13.5px] bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
      >
        {children}
      </select>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: loadingMe } = useCurrentUser();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "employee" as UserRole });
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao buscar usuários");
      const { users: data } = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingMe && !isSuperAdmin) { router.replace("/"); return; }
    if (!loadingMe) fetchUsers();
  }, [loadingMe, isSuperAdmin, router, fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowCreate(false);
      setForm({ email: "", password: "", full_name: "", role: "employee" });
      fetchUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar usuário");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: form.role, full_name: form.full_name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditUser(null);
      fetchUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setSubmitting(true);
    try {
      await fetch(`/api/admin/users/${deleteUser.id}`, { method: "DELETE" });
      setDeleteUser(null);
      fetchUsers();
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMe) return null;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Header title="Admin" subtitle="Gestão de usuários e permissões" />

      <main className="flex-1 overflow-y-auto px-6 py-6 max-w-[1440px] mx-auto w-full space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <SectionTitle icon={Users} title="Usuários" subtitle={`${users.length} cadastrados`} />
              <button
                onClick={() => { setForm({ email: "", password: "", full_name: "", role: "employee" }); setShowCreate(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all shadow-md"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
              >
                <UserPlus size={14} />
                Criar usuário
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 space-y-0">
                {Array.from({ length: 3 }).map((_, i) => <TableRowSkeleton key={i} />)}
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <p className="text-sm text-red-500 mb-3">{error}</p>
                <button onClick={fetchUsers} className="text-sm text-blue-500 hover:underline">Tentar novamente</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-enterprise">
                  <thead>
                    <tr>
                      {["Nome", "E-mail", "Cargo", "Criado em", "Ações"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="font-medium text-[var(--text-primary)]">{u.full_name ?? "—"}</td>
                        <td className="text-[var(--text-secondary)]">{u.email}</td>
                        <td>
                          <Badge variant={ROLE_BADGE[u.role] ?? "default"}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        </td>
                        <td className="text-xs tabular-nums text-[var(--text-muted)]">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditUser(u);
                                setForm({ email: u.email, password: "", full_name: u.full_name ?? "", role: u.role });
                                setFormError(null);
                              }}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteUser(u)}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role legend */}
        <Card>
          <CardHeader>
            <SectionTitle icon={ShieldCheck} title="Cargos e permissões" subtitle="Resumo de acesso por nível" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(
                [
                  { role: "superadmin", desc: "Acesso total — apenas desenvolvedores" },
                  { role: "owner",      desc: "Acesso total exceto painel admin" },
                  { role: "manager",    desc: "Leads, cobrança e follow-ups" },
                  { role: "vendor",     desc: "Visualização de leads próprios" },
                  { role: "employee",   desc: "Visualização básica de leads" },
                  { role: "client",     desc: "Acesso restrito ao cliente" },
                ] as { role: UserRole; desc: string }[]
              ).map(({ role, desc }) => (
                <div key={role} className="flex items-start gap-3 p-3.5 rounded-xl border border-[var(--border)]" style={{ background: "var(--bg-subtle)" }}>
                  <Badge variant={ROLE_BADGE[role]}>{ROLE_LABELS[role]}</Badge>
                  <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Modal criar usuário */}
      {showCreate && (
        <Modal title="Criar novo usuário" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <InputField label="Nome completo" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Ex: Paulo Silva" />
            <InputField label="E-mail" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="paulo@arcil.com.br" required />
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[var(--text-secondary)]">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border text-[13.5px] bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
                <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <SelectField label="Cargo" value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </SelectField>
            {formError && <p className="text-[13px] text-red-500">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Criar usuário
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal editar cargo */}
      {editUser && (
        <Modal title="Editar usuário" onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="p-3.5 rounded-xl border border-[var(--border)]" style={{ background: "var(--bg-subtle)" }}>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{editUser.email}</p>
            </div>
            <InputField label="Nome completo" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            <SelectField label="Cargo" value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </SelectField>
            {formError && <p className="text-[13px] text-red-500">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal confirmar exclusão */}
      {deleteUser && (
        <Modal title="Excluir usuário" onClose={() => setDeleteUser(null)}>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Tem certeza que deseja excluir <span className="font-semibold text-[var(--text-primary)]">{deleteUser.email}</span>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setDeleteUser(null)} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
