"use client";

import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/hooks/use-theme";
import { CurrentUserProvider } from "@/hooks/use-current-user";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CurrentUserProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
