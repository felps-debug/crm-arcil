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
  bar:       string;
  iconBg:    string;
  iconColor: string;
  trendUp:   string;
  trendDown: string;
}> = {
  blue: {
    bar:       "bg-blue-500",
    iconBg:    "bg-blue-500/10",
    iconColor: "text-blue-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
  emerald: {
    bar:       "bg-emerald-500",
    iconBg:    "bg-emerald-500/10",
    iconColor: "text-emerald-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
  amber: {
    bar:       "bg-amber-500",
    iconBg:    "bg-amber-500/10",
    iconColor: "text-amber-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
  red: {
    bar:       "bg-red-500",
    iconBg:    "bg-red-500/10",
    iconColor: "text-red-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
  violet: {
    bar:       "bg-violet-500",
    iconBg:    "bg-violet-500/10",
    iconColor: "text-violet-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
  sky: {
    bar:       "bg-sky-500",
    iconBg:    "bg-sky-500/10",
    iconColor: "text-sky-600",
    trendUp:   "text-emerald-600",
    trendDown: "text-red-500",
  },
};

export function MetricCard({ label, value, change, trend, icon: Icon, accent }: MetricCardProps) {
  const a = accentMap[accent] ?? accentMap.blue;

  return (
    <div
      className={cn(
        "bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all duration-200",
      )}
    >
      <div className="flex min-h-[116px]">
        {/* Accent bar — thin, left side only */}
        <div className={cn("w-[3px] shrink-0", a.bar)} />

        <div className="flex-1 px-5 py-4">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] leading-none">
              {label}
            </p>
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", a.iconBg)}>
              <Icon size={15} className={a.iconColor} strokeWidth={1.8} />
            </div>
          </div>

          <p className="font-data text-[34px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
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
      </div>
    </div>
  );
}
