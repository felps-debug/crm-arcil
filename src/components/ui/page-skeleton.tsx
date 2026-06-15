export function PageSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
      {/* header skeleton */}
      <div className="h-14 border-b border-[var(--border)] px-6 flex items-center gap-4">
        <div className="h-5 w-32 rounded-md animate-shimmer" />
        <div className="flex-1" />
        <div className="h-8 w-36 rounded-lg animate-shimmer hidden md:block" />
        <div className="h-8 w-8 rounded-lg animate-shimmer" />
      </div>

      {/* metric cards row */}
      <div className="px-6 pt-5 pb-2 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden"
          >
            <div className="flex">
              <div className="w-[3px] bg-[var(--bg-subtle)]" />
              <div className="flex-1 px-5 py-4">
                <div className="h-3 w-20 rounded animate-shimmer mb-3" />
                <div className="h-8 w-24 rounded animate-shimmer mb-2" />
                <div className="h-3 w-16 rounded animate-shimmer" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* main card */}
      <div className="px-6 pb-6 flex-1">
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] h-full min-h-[300px]">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg animate-shimmer" />
            <div className="h-4 w-28 rounded animate-shimmer" />
          </div>
          <div className="p-5 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg animate-shimmer" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
