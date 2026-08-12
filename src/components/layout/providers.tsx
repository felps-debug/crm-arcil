"use client";

import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/hooks/use-theme";
import { CurrentUserProvider } from "@/hooks/use-current-user";
import { SidebarProvider } from "@/hooks/use-sidebar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CurrentUserProvider>
        <SidebarProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SidebarProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
