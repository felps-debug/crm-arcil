import { cn } from "@/lib/utils";

/**
 * Loading-state building blocks for the Console design system. Compose these
 * inside the real ConsolePage per-route (see any loading.tsx under src/app/)
 * so the header is never a placeholder — it's already pixel-identical to the
 * loaded page since it's the same component — and only the data-shaped body
 * needs approximating.
 */

export function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("rounded-md animate-shimmer bg-[var(--bg-subtle)]", className)} style={style} />;
}

export function SkeletonMetricsRow({ count = 5 }: { count?: number }) {
  const cols = count <= 3 ? "md:grid-cols-3" : count === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-5";
  return (
    <section className={`grid grid-cols-1 gap-3 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-h-[128px] rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2.5">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-6 w-14" />
            </div>
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-[8px]" />
          </div>
        </div>
      ))}
    </section>
  );
}

export function SkeletonCard({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("space-y-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-4", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} className="h-4" style={{ width: `${92 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ cols = 3, count = 3, cardClassName }: { cols?: number; count?: number; cardClassName?: string }) {
  const colsClass = cols === 2 ? "md:grid-cols-2" : cols >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3";
  return (
    <section className={`grid grid-cols-1 gap-3 ${colsClass}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={3} className={cardClassName} />
      ))}
    </section>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-inset)] px-4 py-3">
        <SkeletonBlock className="h-3 w-32" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <SkeletonBlock className="h-4 w-1/5" />
            <SkeletonBlock className="h-4 w-1/6" />
            <SkeletonBlock className="h-4 w-1/6" />
            <SkeletonBlock className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTwoColumn({ left = "h-[600px]", right = "h-[420px]" }: { left?: string; right?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className={`${left} animate-shimmer rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)]`} />
      <div className={`${right} animate-shimmer rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)]`} />
    </div>
  );
}

export function SkeletonKanbanBoard({ columns = 5 }: { columns?: number }) {
  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="min-h-[420px] w-[284px] shrink-0 space-y-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-24 w-full rounded-[10px]" />
          <SkeletonBlock className="h-24 w-full rounded-[10px]" />
        </div>
      ))}
    </div>
  );
}
