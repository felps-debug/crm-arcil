"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useSidebar } from "@/contexts/sidebar-context";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin  = pathname === "/login";
  const { sidebarOpen } = useSidebar();

  if (isLogin) return <>{children}</>;

  return (
    <motion.div
      initial={false}
      animate={{ "--sidebar-margin": sidebarOpen ? "220px" : "64px" } as Record<string, string>}
      transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.85 }}
      className="flex-1 flex flex-col h-full overflow-hidden pt-14 md:pt-0 md:ml-[var(--sidebar-margin)]"
    >
      {children}
    </motion.div>
  );
}
