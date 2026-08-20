import { GammazButton } from "@/components/moderation/gammaz-button";

/**
 * Başlık gammazı. `open` verildiğinde `GammazButton` kendi tetikleyicisini
 * render etmez — kipi başlıktaki ⋮ menüsündeki öğe açar.
 */
export function TopicReportButton({
  topicId,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  topicId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Kip kapanınca odağın döneceği kontrol; kontrollü kipte ⋮ tetikleyicisi. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <GammazButton
      targetType="TOPIC"
      targetId={topicId}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
      {...(returnFocusRef ? { returnFocusRef } : {})}
    />
  );
}
