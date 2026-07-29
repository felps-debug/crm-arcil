"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Boxes,
  Brain,
  CreditCard,
  Gauge,
  Image as ImageIcon,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTheme } from "@/hooks/use-theme";
import { getUrgentFollowupsCount } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Leads", icon: Users, badge: true },
  { href: "/agentes", label: "Agentes IA", icon: Bot },
  { href: "/demanda-estoque", label: "Demanda & Estoque", icon: Boxes, perm: "manage_estoque" },
  { href: "/cobranca", label: "Campanhas & Cobrancas", icon: CreditCard, perm: "manage_cobranca" },
  { href: "/chatbot", label: "Gerador de Imagem", icon: ImageIcon, perm: "manage_gerador_imagem" },
  { href: "/cerebro", label: "Cerebro Arcil", icon: Brain },
  { href: "/admin", label: "Admin", icon: ShieldCheck, superAdminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isSuperAdmin, isOwnerOrAbove, can } = useCurrentUser();
  const { theme, toggle: toggleTheme } = useTheme();
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    getUrgentFollowupsCount().then(setUrgentCount);
    const id = setInterval(() => getUrgentFollowupsCount().then(setUrgentCount), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (pathname === "/login") return null;

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const displayName = profile?.full_name ?? profile?.email ?? "Arcil Admin";
  const role = profile?.role ?? "Admin Master";

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[244px] flex-col border-r border-[#1f2b3d] bg-[#050b14] text-[#d8e2f2]">
      <div className="flex items-center gap-3 px-6 pb-8 pt-8">
        <Image src="/logo-icon.png" alt="Arcil" width={34} height={34} className="h-[34px] w-[34px] shrink-0 object-contain" />
        <div>
          <div className="text-[24px] font-extrabold leading-none tracking-normal text-[#a9c9ff]">ARCIL</div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7f8ca3]">Operacional Comercial</div>
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-3">
        {NAV.filter((item) => {
          if (item.superAdminOnly) return isSuperAdmin;
          if (item.perm) return isOwnerOrAbove || can(item.perm);
          return true;
        }).map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          const showBadge = badge && urgentCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[14px] px-4 text-[14px] font-semibold transition-colors",
                active
                  ? "bg-[#2d7dff] text-white shadow-[0_0_30px_rgba(45,125,255,0.35)]"
                  : "text-[#c8d1df] hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span className="flex flex-1 items-center justify-between leading-tight">
                {label}
                {showBadge && (
                  <span className="ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {urgentCount > 99 ? "99+" : urgentCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#1f2b3d] px-3 py-5">
        {isSuperAdmin && (
          <Link href="/admin" className="mb-2 flex items-center gap-3 rounded-[12px] px-4 py-2.5 text-[13px] font-semibold text-[#c8d1df] hover:bg-white/[0.06]">
            <Settings size={17} />
            Configuracoes
          </Link>
        )}

        <button
          onClick={toggleTheme}
          className="mb-5 flex w-full items-center gap-3 rounded-[12px] px-4 py-2.5 text-[13px] font-semibold text-[#c8d1df] transition-colors hover:bg-white/[0.06]"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>

        <div className="mb-4 flex items-center gap-3 px-3">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-[#2a3a52] bg-[#0d1a2a] text-[12px] font-bold text-blue-200">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-white">{displayName}</div>
            <div className="truncate text-[11px] text-[#7f8ca3]">{role}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#1a2636] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#24344a]"
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}
