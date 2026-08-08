"use client";

import { ShieldAlert } from "lucide-react";
import { ConsoleCard } from "@/components/console/console-shell";
import { useCurrentUser } from "@/hooks/use-current-user";

export function AccessGuard({
  perm,
  superAdminOnly,
  children,
}: {
  perm?: string;
  superAdminOnly?: boolean;
  children: React.ReactNode;
}) {
  const { loading, isSuperAdmin, isOwnerOrAbove, can } = useCurrentUser();

  if (loading) return null;

  const allowed = superAdminOnly ? isSuperAdmin : perm ? isOwnerOrAbove || can(perm) : true;

  if (!allowed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ConsoleCard className="max-w-sm text-center">
          <ShieldAlert size={28} className="mx-auto mb-3 text-amber-400" />
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Acesso restrito</h2>
          <p className="mt-2 text-[12px] text-[var(--text-muted)]">
            Você não tem permissão para acessar esta área. Fale com um administrador se precisar de acesso.
          </p>
        </ConsoleCard>
      </div>
    );
  }

  return <>{children}</>;
}
