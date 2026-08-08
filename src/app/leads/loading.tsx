import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonBlock, SkeletonKanbanBoard } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Leads" subtitle="Gestão de leads e oportunidades">
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-10 w-24 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-28 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-24 rounded-[10px]" />
      </div>
      <SkeletonKanbanBoard columns={5} />
    </ConsolePage>
  );
}
