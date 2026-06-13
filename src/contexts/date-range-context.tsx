"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

interface DateRangeContextValue {
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
}

const DateRangeContext = createContext<DateRangeContextValue>({
  dateRange: null,
  setDateRange: () => {},
});

const PERIOD_PRESETS: Record<string, () => DateRange> = {
  "7d": () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: to.toISOString(), label: "7d" };
  },
  "30d": () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: to.toISOString(), label: "30d" };
  },
  "90d": () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    return { from: from.toISOString(), to: to.toISOString(), label: "90d" };
  },
  "6m": () => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString(), to: to.toISOString(), label: "6m" };
  },
  "1y": () => {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString(), to: to.toISOString(), label: "1y" };
  },
};

export function getPresetRange(key: string): DateRange | null {
  const fn = PERIOD_PRESETS[key];
  return fn ? fn() : null;
}

export const PRESET_OPTIONS = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "6m", label: "6 meses" },
  { key: "1y", label: "1 ano" },
] as const;

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  return useContext(DateRangeContext);
}
