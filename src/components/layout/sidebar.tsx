"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Receipt, Image as ImageIcon,
  Menu, X, LogOut, Moon, Sun, Bot, Package,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "@/hooks/use-theme";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { href: "/",         label: "Dashboard",         icon: LayoutDashboard },
  { href: "/leads",    label: "Leads",             icon: Users           },
  { href: "/agentes",  label: "Agentes IA",        icon: Bot             },
  { href: "/demanda-estoque", label: "Demanda & Estoque", icon: Package  },
  { href: "/cobranca", label: "Cobrança",          icon: Receipt         },
  { href: "/chatbot",  label: "Gerador de Imagem", icon: ImageIcon       },
];

function NavItems({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  return (
    <div className="space-y-0.5 px-3">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              active
                ? "text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
            )}
          >
            {/* Active indicator */}
            {active && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg"
                style={{
                  background: "rgba(37,99,235,0.22)",
                  borderLeft: "3px solid #2563eb",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon
              size={16}
              strokeWidth={active ? 2.4 : 1.8}
              className={cn(
                "relative z-10 flex-shrink-0 transition-colors duration-150",
                active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
              )}
            />
            <span className="relative z-10 flex-1 truncate">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  if (pathname === "/login") return null;

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const logo = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 p-1">
        <Image src="/logo.png" alt="ARCIL" width={40} height={40} className="w-full h-full object-contain" />
      </div>
      <div>
        <p className="text-white font-extrabold text-[17px] leading-none tracking-wider">
          ARCIL
        </p>
        <p className="text-[10px] font-bold mt-1 tracking-[0.25em]" style={{ color: "rgba(148,163,184,0.7)" }}>
          CRM
        </p>
      </div>
    </div>
  );

  const footer = (
    <div
      className="px-4 py-4"
      style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="flex items-center gap-3 px-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)" }}
        >
          <span className="text-blue-400 text-[10.5px] font-bold">AD</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-300 text-[12px] font-medium truncate leading-none">Admin ARCIL</p>
          <p className="text-slate-600 text-[10.5px] truncate mt-0.5">admin@arcil.com.br</p>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          aria-label="Sair da conta"
          className="p-1.5 text-slate-600 hover:text-red-400 transition-colors duration-150 rounded-md hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  );

  const sidebarBody = (
    <>
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{logo}</div>

      {/* Section label */}
      <div className="px-6 pb-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(148,163,184,0.45)" }}>
          Menu
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pb-2">
        <NavItems pathname={pathname} onClose={() => setMobileOpen(false)} />
      </nav>

      {/* Theme toggle */}
      <div className="px-4 py-2">
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === "dark" ? "Modo Claro" : "Modo Escuro"}</span>
        </button>
      </div>

      {/* Powered by */}
      <div className="px-4 py-3">
        <div
          className="px-3 py-2.5 rounded-lg"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(148,163,184,0.45)" }}>
            Powered by
          </p>
          <p className="text-slate-300 text-[11.5px] font-semibold mt-0.5 tracking-wide">FLUXO · Automações IA</p>
        </div>
      </div>

      {footer}
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-screen w-[248px] flex-col z-40"
        style={{
          background: "#04091a",
          borderRight: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {sidebarBody}
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3"
        style={{
          background: "#04091a",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Menu size={20} />
        </button>
        {logo}
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative w-[248px] flex flex-col h-full shadow-2xl"
              style={{ background: "#04091a" }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="absolute right-3 top-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <X size={17} />
              </button>
              {sidebarBody}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
