"use client";

import { DateRangeProvider } from "@/contexts/date-range-context";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/hooks/use-theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DateRangeProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </DateRangeProvider>
    </ThemeProvider>
  );
}
