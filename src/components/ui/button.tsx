import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
}

const variants = {
  primary:
    "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:shadow-none active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-700",
  secondary:
    "bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] ring-1 ring-[var(--border-strong)] shadow-sm hover:shadow-md active:scale-[0.98] dark:hover:shadow-[0_0_10px_rgba(76,147,255,0.12)]",
  ghost:
    "hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] active:bg-[var(--bg-subtle)] active:scale-[0.98]",
  danger:
    "bg-red-600 hover:bg-red-700 text-white shadow-sm active:shadow-none active:scale-[0.98] dark:bg-red-600 dark:hover:bg-red-700",
};

const sizes = {
  xs: "px-2.5 py-1 text-[11px] rounded-lg",
  sm: "px-3.5 py-2.5 text-xs rounded-xl",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-5 py-2.5 text-sm rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
