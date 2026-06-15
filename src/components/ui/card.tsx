import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  accent?: boolean;
}

export function Card({ children, className, onClick, hover = false, accent = false }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden",
        hover && "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all duration-200 cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {accent && (
        <div className="h-px bg-gradient-to-r from-blue-500/70 via-violet-500/50 to-transparent" />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 py-4 border-b border-[var(--border)]", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {children}
    </div>
  );
}
