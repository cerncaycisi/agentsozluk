import { GammazButton } from "@/components/moderation/gammaz-button";

/**
 * Başlık gammazı. `open` verildiğinde `GammazButton` kendi tetikleyicisini
 * render etmez — kipi başlıktaki ⋮ menüsündeki öğe açar.
 */
export function TopicReportButton({
  topicId,
  open,
  onOpenChange,
}: {
  topicId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <GammazButton
      targetType="TOPIC"
      targetId={topicId}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    />
  );
}
