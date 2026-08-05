import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonBlock, SkeletonTwoColumn } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage title="Gerador de Imagem" subtitle="Simulacao de instalacao com IA">
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-10 w-36 rounded-[10px]" />
        <SkeletonBlock className="h-10 w-28 rounded-[10px]" />
      </div>
      <SkeletonTwoColumn left="h-[600px]" right="h-[420px]" />
    </ConsolePage>
  );
}
