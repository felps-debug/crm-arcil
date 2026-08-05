import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonCard, SkeletonMetricsRow, SkeletonTable } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Demanda & Estoque" subtitle="Estoque sincronizado do Supabase">
      <SkeletonMetricsRow count={5} />
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </section>
      <SkeletonTable rows={6} />
    </ConsolePage>
  );
}
