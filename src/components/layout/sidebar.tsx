"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getUrgentFollowupsCount } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Users, Receipt, Image as ImageIcon,
  Menu, X, LogOut, Moon, Sun, Bot, Package, ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "@/hooks/use-theme";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSidebar } from "@/contexts/sidebar-context";

const NAV_BASE = [
  { href: "/",                label: "Dashboard",         icon: LayoutDashboard },
  { href: "/leads",           label: "Leads",             icon: Users,  badge: true },
  { href: "/agentes",         label: "Agentes IA",        icon: Bot             },
  { href: "/demanda-estoque", label: "Demanda & Estoque", icon: Package         },
  { href: "/cobranca",        label: "Cobrança",          icon: Receipt         },
  { href: "/chatbot",         label: "Gerador de Imagem", icon: ImageIcon       },
];

const NAV_ADMIN = { href: "/admin", label: "Admin", icon: ShieldCheck, badge: false };

const labelAnim = {
  show: { opacity: 1, x: 0,  transition: { duration: 0.16, delay: 0.07 } },
  hide: { opacity: 0, x: -6, transition: { duration: 0.1,  delay: 0    } },
};

export function Sidebar() {
  const pathname    = usePathname();
  const router      = useRouter();
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [urgentCount,   setUrgentCount]   = useState(0);
  const { sidebarOpen, setSidebarOpen }   = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const { profile, isSuperAdmin } = useCurrentUser();

  useEffect(() => {
    getUrgentFollowupsCount().then(setUrgentCount);
    const id = setInterval(() => getUrgentFollowupsCount().then(setUrgentCount), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (pathname === "/login") return null;

  const nav = isSuperAdmin ? [...NAV_BASE, NAV_ADMIN] : NAV_BASE;

  const displayName = profile?.full_name ?? profile?.email ?? "Usuário";
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  /* ── Desktop — Framer Motion spring expand ─────────────────────── */
  const desktopSidebar = (
    <motion.aside
      onHoverStart={() => setSidebarOpen(true)}
      onHoverEnd={() => setSidebarOpen(false)}
      initial={false}
      animate={{ width: sidebarOpen ? 220 : 64 }}
      transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.85 }}
      className="hidden md:flex fixed left-0 top-0 h-screen flex-col z-40 overflow-hidden"
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
        boxShadow: "2px 0 20px rgba(0,0,0,0.22)",
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 shrink-0" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
          <Image src="/logo.png" alt="ARCIL" width={32} height={32} className="w-full h-full object-contain" />
        </div>
        <motion.div
          initial={false}
          animate={sidebarOpen ? "show" : "hide"}
          variants={labelAnim}
          className="ml-3 overflow-hidden whitespace-nowrap flex items-center gap-2"
        >
          <Image src="/logo-arcil-full.png" alt="Grupo Arcil" width={108} height={36} className="h-[15px] w-auto object-contain" />
          <span className="text-[9px] font-semibold tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.3)" }}>CRM</span>
        </motion.div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="space-y-0.5 px-2">
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const showBadge = badge && urgentCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center h-10 rounded-lg transition-colors duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50",
                  active
                    ? "text-white"
                    : "text-white/40 hover:text-white/80 hover:bg-white/[0.06]"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nav-active-desktop"
                    className="absolute inset-0 rounded-lg bg-white/[0.10]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10 w-10 h-10 flex items-center justify-center shrink-0">
                  <Icon size={16} strokeWidth={active ? 2 : 1.6} className={active ? "text-white" : "text-white/40 group-hover:text-white/70"} />
                  {showBadge && !sidebarOpen && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-[var(--sidebar-bg)]" />
                  )}
                </span>
                <motion.span
                  initial={false}
                  animate={sidebarOpen ? "show" : "hide"}
                  variants={labelAnim}
                  className="relative z-10 text-[13px] font-medium whitespace-nowrap overflow-hidden flex items-center gap-2"
                >
                  {label}
                  {showBadge && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      {urgentCount > 99 ? "99+" : urgentCount}
                    </span>
                  )}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Theme + footer */}
      <div className="shrink-0" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center h-10 px-2 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors focus-visible:outline-none"
        >
          <span className="w-10 h-10 flex items-center justify-center shrink-0">
            {theme === "dark" ? <Sun size={14} strokeWidth={1.6} /> : <Moon size={14} strokeWidth={1.6} />}
          </span>
          <motion.span
            initial={false}
            animate={sidebarOpen ? "show" : "hide"}
            variants={labelAnim}
            className="text-[12px] whitespace-nowrap overflow-hidden"
          >
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </motion.span>
        </button>

        <div className="flex items-center h-14 px-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
            <span className="text-white/70 text-[10px] font-bold">{initials}</span>
          </div>
          <motion.div
            initial={false}
            animate={sidebarOpen ? "show" : "hide"}
            variants={labelAnim}
            className="flex-1 min-w-0 ml-2.5 overflow-hidden whitespace-nowrap"
          >
            <p className="text-white/70 text-[12px] font-semibold truncate leading-none">{displayName}</p>
            <p className="text-white/25 text-[10px] truncate mt-0.5">{profile?.email ?? ""}</p>
          </motion.div>
          <motion.button
            initial={false}
            animate={sidebarOpen ? "show" : "hide"}
            variants={labelAnim}
            onClick={handleLogout}
            title="Sair"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-white/25 hover:text-red-400 hover:bg-white/[0.05] transition-colors"
          >
            <LogOut size={13} />
          </motion.button>
        </div>
      </div>
    </motion.aside>
  );

  /* ── Mobile top bar + drawer ───────────────────────────────────── */
  const mobileBar = (
    <>
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md overflow-hidden bg-white/10">
            <Image src="/logo.png" alt="ARCIL" width={24} height={24} className="w-full h-full object-contain" />
          </div>
          <Image src="/logo-arcil-full.png" alt="Grupo Arcil" width={108} height={36} className="h-[14px] w-auto object-contain" />
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="relative w-[220px] flex flex-col h-full"
              style={{ background: "var(--sidebar-bg)" }}
            >
              <div className="h-14 flex items-center px-4 justify-between shrink-0" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md overflow-hidden bg-white/10">
                    <Image src="/logo.png" alt="ARCIL" width={28} height={28} className="w-full h-full object-contain" />
                  </div>
                  <Image src="/logo-arcil-full.png" alt="Grupo Arcil" width={108} height={36} className="h-[15px] w-auto object-contain" />
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1.5 text-white/40 hover:text-white rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {nav.map(({ href, label, icon: Icon, badge }) => {
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                  const showBadge = badge && urgentCount > 0;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 h-10 px-3 rounded-lg text-[13px] font-medium transition-all",
                        active ? "text-white bg-white/10" : "text-white/40 hover:text-white/80 hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon size={15} strokeWidth={active ? 2 : 1.6} />
                      {label}
                      {showBadge && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                          {urgentCount > 99 ? "99+" : urgentCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="shrink-0 px-2 pb-4 pt-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
                <button onClick={toggleTheme} className="w-full flex items-center gap-3 h-9 px-3 rounded-lg text-[12px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors">
                  {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                  {theme === "dark" ? "Modo claro" : "Modo escuro"}
                </button>
                <div className="flex items-center gap-2.5 mt-2 px-3">
                  <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center shrink-0">
                    <span className="text-white/60 text-[9px] font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/60 text-[11px] font-semibold truncate">{displayName}</p>
                    <p className="text-white/25 text-[10px] truncate">{profile?.email ?? ""}</p>
                  </div>
                  <button onClick={handleLogout} className="text-white/25 hover:text-red-400 transition-colors">
                    <LogOut size={13} />
                  </button>
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <>
      {desktopSidebar}
      {mobileBar}
    </>
  );
}
