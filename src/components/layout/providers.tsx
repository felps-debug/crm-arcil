"use client";

import { DateRangeProvider } from "@/contexts/date-range-context";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/hooks/use-theme";
import { CurrentUserProvider } from "@/hooks/use-current-user";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CurrentUserProvider>
        <SidebarProvider>
          <DateRangeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </DateRangeProvider>
        </SidebarProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
