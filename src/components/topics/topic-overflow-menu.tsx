"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVertical, Flag } from "lucide-react";
import { useRef, useState } from "react";
import { TopicReportButton } from "@/components/topics/topic-report-button";
import { TopicShareSubmenu } from "@/components/topics/topic-ai-share";

/**
 * Başlık üstündeki ⋮ menüsü. Deseni entry aksiyon şeridindeki `EntryOverflowMenu`
 * ile aynı (`src/components/entries/entry-actions.tsx`): tetikleyici tek bir
 * etiketli ikon düğmesi, içerik Radix `DropdownMenu`.
 *
 * Buraya yalnız **ikincil** işlemler girer. Başlık satırının kendi gürültüsünü
 * artırmadan paylaşımı ve gammazı taşıyor; sıralama/pencere/arama gibi okuma
 * akışının içindeki kontroller menüye GİRMEZ, onlar JS'siz de çalışmak zorunda.
 *
 * Menü hiç öğesi yokken render edilmemeli; "Paylaş" oturum gerektirmediği için
 * pratikte her zaman en az bir öğe var, yine de doluluk kararı çağırana ait
 * (gizlenmiş başlıkta sayfa bu bileşeni hiç çağırmıyor).
 */
export function TopicOverflowMenu({
  title,
  shareUrl,
  topicId,
  canReport,
}: {
  title: string;
  /** MUTLAK adres: paylaşılan prompt başka bir araca gidiyor, göreli yol oraya gitmez. */
  shareUrl: string;
  topicId: string;
  canReport: boolean;
}) {
  const [gammazOpen, setGammazOpen] = useState(false);
  /*
    Gammaz kipi kapanınca odak buraya dönmeli. Kontrollü kipte `GammazButton`
    kendi `AlertDialog.Trigger`ını render etmediği için Radix'in odak iadesi
    boşa düşüyordu (Escape / "Vazgeç" / başarılı gönderim: odak `<body>`).
  */
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label="Diğer başlık işlemleri"
            className="chip w-9 justify-center px-0 text-ink"
          >
            <EllipsisVertical aria-hidden="true" size={17} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-[75] min-w-56 rounded-lg border bg-surface p-2"
          >
            <TopicShareSubmenu title={title} url={shareUrl} />
            {canReport ? (
              <>
                <DropdownMenu.Separator className="my-1 border-t" />
                <DropdownMenu.Item onSelect={() => setGammazOpen(true)} className="menu-item">
                  <Flag aria-hidden="true" size={16} />
                  Başlığı gammazla
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {/*
        Gammaz kipi menüden açılıyor: kontrollü kipte `GammazButton` kendi
        tetikleyicisini render etmez ve kapalıyken hiç DOM üretmez, bu yüzden
        başlık satırının yüksekliğine dokunmaz.
      */}
      {canReport ? (
        <TopicReportButton
          topicId={topicId}
          open={gammazOpen}
          onOpenChange={setGammazOpen}
          returnFocusRef={trigger}
        />
      ) : null}
    </>
  );
}
