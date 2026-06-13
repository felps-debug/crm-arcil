import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
  accent: string;
}

const accentMap: Record<string, {
  gradient: string;
  iconBg: string;
  iconColor: string;
  iconRing: string;
  trendUp: string;
  trendDown: string;
}> = {
  blue: {
    gradient:  "from-blue-500 via-blue-600 to-indigo-600",
    iconBg:    "bg-blue-500/10",
    iconColor: "text-blue-600",
    iconRing:  "ring-blue-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
  emerald: {
    gradient:  "from-emerald-500 via-emerald-600 to-teal-600",
    iconBg:    "bg-emerald-500/10",
    iconColor: "text-emerald-600",
    iconRing:  "ring-emerald-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
  amber: {
    gradient:  "from-amber-400 via-amber-500 to-orange-500",
    iconBg:    "bg-amber-500/10",
    iconColor: "text-amber-600",
    iconRing:  "ring-amber-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
  red: {
    gradient:  "from-red-500 via-red-600 to-rose-600",
    iconBg:    "bg-red-500/10",
    iconColor: "text-red-600",
    iconRing:  "ring-red-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
  violet: {
    gradient:  "from-violet-500 via-violet-600 to-purple-600",
    iconBg:    "bg-violet-500/10",
    iconColor: "text-violet-600",
    iconRing:  "ring-violet-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
  sky: {
    gradient:  "from-sky-400 via-sky-500 to-cyan-500",
    iconBg:    "bg-sky-500/10",
    iconColor: "text-sky-600",
    iconRing:  "ring-sky-500/20",
    trendUp:   "text-emerald-700 bg-emerald-50",
    trendDown: "text-red-600 bg-red-50",
  },
};

export function MetricCard({ label, value, change, trend, icon: Icon, accent }: MetricCardProps) {
  const a = accentMap[accent] ?? accentMap.blue;

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-[var(--border)] overflow-hidden transition-all duration-200",
        "hover:shadow-[var(--shadow-lg)] hover:-translate-y-1",
        "shadow-[var(--shadow-md)]",
      )}
    >
      <div className={cn("h-1.5 bg-gradient-to-r", a.gradient)} />

      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center ring-2", a.iconBg, a.iconRing)}>
            <Icon size={20} className={a.iconColor} strokeWidth={2} />
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1",
            trend === "up" ? a.trendUp : a.trendDown,
          )}>
            {trend === "up"
              ? <TrendingUp  size={12} strokeWidth={2.5} />
              : <TrendingDown size={12} strokeWidth={2.5} />
            }
            {change}
          </span>
        </div>

        <p className="font-data text-[32px] font-extrabold text-[var(--text-primary)] leading-none tracking-tight">
          {value}
        </p>

        <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mt-3">
          {label}
        </p>
      </div>
    </div>
  );
}
