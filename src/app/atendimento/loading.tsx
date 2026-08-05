import { ConsolePage } from "@/components/console/console-shell";
import { SkeletonBlock, SkeletonTwoColumn } from "@/components/console/console-skeleton";

export default function Loading() {
  return (
    <ConsolePage
      title="Atendimento"
      subtitle="Conversas do WhatsApp via Chatwoot"
      actions={<SkeletonBlock className="h-10 w-64 rounded-[999px]" />}
    >
      <SkeletonTwoColumn left="h-[min(680px,75dvh)]" right="h-[min(680px,75dvh)]" />
    </ConsolePage>
  );
}
