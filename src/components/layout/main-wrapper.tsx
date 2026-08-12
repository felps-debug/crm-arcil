"use client";

import { usePathname } from "next/navigation";
import { useSidebar } from "@/hooks/use-sidebar";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isLogin = pathname === "/login";

  if (isLogin) return <>{children}</>;

  return (
    <div
      // `rail-offset` (globals.css) só aplica a margem a partir de `md`, onde o
      // trilho existe. Abaixo disso ele vira topbar e não desloca nada, então a
      // margem não pode vir de estilo inline — inline valeria em toda largura.
      className="rail-offset flex h-full flex-1 flex-col overflow-hidden pt-14 transition-[margin] duration-200 ease-out md:pt-0"
      style={{ ["--rail-w" as string]: collapsed ? "var(--sidebar-w-closed)" : "var(--sidebar-w-open)" }}
    >
      {children}
    </div>
  );
}
