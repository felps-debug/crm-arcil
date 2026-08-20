import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
}

const variants = {
  primary:
    "bg-[var(--blue)] hover:brightness-110 text-white shadow-sm hover:shadow-md active:scale-[0.98]",
  secondary:
    "bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] ring-1 ring-[var(--border-strong)] shadow-sm hover:shadow-md active:scale-[0.98]",
  ghost:
    "hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] active:bg-[var(--bg-subtle)] active:scale-[0.98]",
  danger:
    "bg-[var(--red)] hover:brightness-110 text-white shadow-sm hover:shadow-md active:scale-[0.98]",
};

const sizes = {
  xs: "px-2.5 py-1 text-[11px] rounded-md",
  sm: "px-3.5 py-2.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-5 py-2.5 text-sm rounded-xl",
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
