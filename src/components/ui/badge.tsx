import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline" | "violet";

const variants: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-600/10",
  info: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/10",
  outline: "bg-transparent text-slate-500 ring-1 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/10",
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
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold tracking-wide transition-all duration-150",
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
