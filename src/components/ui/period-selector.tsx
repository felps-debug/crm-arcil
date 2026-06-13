"use client";

import { CalendarDays, X } from "lucide-react";
import { useDateRange, getPresetRange, PRESET_OPTIONS } from "@/contexts/date-range-context";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

export function PeriodSelector() {
  const { dateRange, setDateRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (key: string) => {
    const range = getPresetRange(key);
    setDateRange(range);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDateRange(null);
    setOpen(false);
  };

  const activeLabel = dateRange
    ? PRESET_OPTIONS.find((o) => o.key === dateRange.label)?.label ?? dateRange.label
    : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition-all",
          dateRange
            ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm shadow-blue-100/50"
            : "bg-white/60 backdrop-blur-sm border-slate-200/60 text-slate-600 hover:bg-white hover:shadow-sm"
        )}
      >
        <CalendarDays size={14} />
        <span className="font-medium text-[13px]">
          {activeLabel ?? "Todo período"}
        </span>
        {dateRange && (
          <span
            onClick={handleClear}
            className="p-0.5 rounded-md hover:bg-blue-200/50 transition-colors"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl rounded-xl shadow-[var(--shadow-xl)] border border-slate-200/60 py-1.5 min-w-[160px] z-50 animate-fade-in">
          <button
            onClick={() => { setDateRange(null); setOpen(false); }}
            className={cn(
              "w-full text-left px-4 py-2 text-[13px] font-medium transition-colors",
              !dateRange ? "text-blue-700 bg-blue-50" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Todo período
          </button>
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSelect(opt.key)}
              className={cn(
                "w-full text-left px-4 py-2 text-[13px] font-medium transition-colors",
                dateRange?.label === opt.key
                  ? "text-blue-700 bg-blue-50"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
