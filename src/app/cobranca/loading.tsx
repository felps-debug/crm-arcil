import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonBlock, SkeletonMetricsRow, SkeletonTable } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Cobranças" subtitle="Disparos e acompanhamento em tempo real">
      <SkeletonMetricsRow count={5} />
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-10 w-24 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-32 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-28 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-32 rounded-[10px]" />
      </div>
      <SkeletonTable rows={6} />
    </ConsolePage>
  );
}
