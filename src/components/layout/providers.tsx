"use client";

import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/hooks/use-theme";
import { CurrentUserProvider } from "@/hooks/use-current-user";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { UrgentFollowupsProvider } from "@/hooks/use-urgent-followups";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CurrentUserProvider>
        <UrgentFollowupsProvider>
          <SidebarProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </SidebarProvider>
        </UrgentFollowupsProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
