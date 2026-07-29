import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  change?: string;
  trend?: "up" | "down";
}

const accentMap: Record<string, {
  iconBg:    string;
  iconColor: string;
  trendUp:   string;
  trendDown: string;
}> = {
  blue: {
    iconBg:    "bg-blue-500/10 dark:bg-[var(--dsc-primary)]/15",
    iconColor: "text-blue-600 dark:text-[var(--dsc-primary)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
  emerald: {
    iconBg:    "bg-emerald-500/10 dark:bg-[var(--dsc-success)]/15",
    iconColor: "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
  amber: {
    iconBg:    "bg-amber-500/10 dark:bg-[var(--dsc-warning)]/15",
    iconColor: "text-amber-600 dark:text-[var(--dsc-warning)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
  red: {
    iconBg:    "bg-red-500/10 dark:bg-[var(--dsc-error)]/15",
    iconColor: "text-red-600 dark:text-[var(--dsc-error)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
  violet: {
    iconBg:    "bg-violet-500/10 dark:bg-[var(--dsc-ai)]/15",
    iconColor: "text-violet-600 dark:text-[var(--dsc-ai)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
  sky: {
    iconBg:    "bg-sky-500/10 dark:bg-[var(--dsc-primary)]/15",
    iconColor: "text-sky-600 dark:text-[var(--dsc-primary)]",
    trendUp:   "text-emerald-600 dark:text-[var(--dsc-success)]",
    trendDown: "text-red-500 dark:text-[var(--dsc-error)]",
  },
};

export function MetricCard({ label, value, change, trend, icon: Icon, accent }: MetricCardProps) {
  const a = accentMap[accent] ?? accentMap.blue;

  return (
    <div
      className={cn(
        "bg-[var(--bg-surface)] rounded-xl dark:rounded-[14px] border border-[var(--border)]",
        "dark:bg-gradient-to-b dark:from-[var(--bg-surface)] dark:to-[var(--bg-inset)]",
        "shadow-[var(--shadow-card)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all duration-200",
        "px-5 py-4",
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] leading-none">
          {label}
        </p>
        <div className={cn("w-8 h-8 rounded-lg dark:rounded-[10px] flex items-center justify-center shrink-0", a.iconBg)}>
          <Icon size={15} className={a.iconColor} strokeWidth={1.8} />
        </div>
      </div>

      <p className="font-data text-[34px] dark:text-[28px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
        {value}
      </p>

      {change && trend && (
        <p className={cn(
          "text-[11px] font-semibold mt-2.5 flex items-center gap-1",
          trend === "up" ? a.trendUp : a.trendDown,
        )}>
          {trend === "up"
            ? <TrendingUp  size={11} strokeWidth={2.5} />
            : <TrendingDown size={11} strokeWidth={2.5} />
          }
          {change}
        </p>
      )}
    </div>
  );
}
