import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-lg animate-shimmer", className)} />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-md)] overflow-hidden">
      <Skeleton className="h-1.5 w-full rounded-none" />
      <div className="px-6 py-5">
        <div className="flex items-start justify-between mb-4">
          <Skeleton className="w-11 h-11 rounded-xl" />
          <Skeleton className="w-16 h-5 rounded-full" />
        </div>
        <Skeleton className="w-24 h-8 mb-3" />
        <Skeleton className="w-28 h-3.5" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <Skeleton className="w-28 h-4" />
      </div>
      <div className="px-6 py-5 space-y-3">
        <Skeleton className="w-full h-36" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--border)]">
      <Skeleton className="w-9 h-9 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-36 h-3.5" />
        <Skeleton className="w-24 h-3" />
      </div>
      <Skeleton className="w-16 h-6 rounded-full" />
      <Skeleton className="w-14 h-3.5" />
    </div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div className="w-[300px] flex-shrink-0 space-y-2.5">
      <Skeleton className="w-full h-14 rounded-2xl" />
      <Skeleton className="w-full h-24 rounded-2xl" />
      <Skeleton className="w-full h-24 rounded-2xl" />
      <Skeleton className="w-full h-24 rounded-2xl" />
    </div>
  );
}
