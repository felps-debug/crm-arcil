import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline" | "violet";

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--bg-subtle)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/15",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/15",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-600/15",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-600/15",
  outline: "bg-transparent text-[var(--text-secondary)] ring-1 ring-[var(--border)]",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-600/15",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function Badge({ children, variant = "default", className, dot }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11.5px] font-semibold tracking-wide transition-all duration-150",
      variants[variant],
      className
    )}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", {
        "bg-slate-400": variant === "default" || variant === "outline",
        "bg-emerald-500": variant === "success",
        "bg-amber-500": variant === "warning",
        "bg-red-500": variant === "danger",
        "bg-sky-500": variant === "info",
        "bg-violet-500": variant === "violet",
      })} />}
      {children}
    </span>
  );
}
