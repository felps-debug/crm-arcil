import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonCardGrid, SkeletonMetricsRow, SkeletonTable } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Agentes IA" subtitle="Monitoramento e controle dos agentes">
      <SkeletonMetricsRow count={3} />
      <SkeletonCardGrid cols={3} count={6} />
      <SkeletonTable rows={4} />
    </ConsolePage>
  );
}
