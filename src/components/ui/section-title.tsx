import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionTitleProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconBg?: string;
  iconColor?: string;
}

export function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  iconBg = "bg-blue-500/10",
  iconColor = "text-blue-600",
}: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
        <Icon size={16} className={iconColor} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs mt-0.5 text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
