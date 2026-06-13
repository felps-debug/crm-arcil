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
        "bg-white rounded-2xl border border-[var(--border)] shadow-[var(--shadow-md)] overflow-hidden",
        hover && "hover:shadow-[var(--shadow-lg)] hover:-translate-y-px transition-all duration-200 cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {accent && (
        <div className="h-1 bg-gradient-to-r from-[#2563eb] via-[#7c3aed] to-[#06b6d4]" />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "px-6 py-4 border-b border-[var(--border)]",
      className
    )}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-6 py-5", className)}>
      {children}
    </div>
  );
}
