import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonCard, SkeletonMetricsRow, SkeletonTable } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Dashboard" subtitle="Visao central da operacao">
      <SkeletonMetricsRow count={5} />
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </section>
      <SkeletonTable rows={5} />
    </ConsolePage>
  );
}
