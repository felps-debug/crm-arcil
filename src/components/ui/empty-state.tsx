import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon; title: string; description: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in", className)}>
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50 ring-1 ring-slate-200/60 shadow-sm flex items-center justify-center mb-4">
        <Icon size={20} className="text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-[240px] leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
