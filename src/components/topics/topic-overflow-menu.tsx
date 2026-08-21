"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVertical, Flag } from "lucide-react";
import { useRef, useState } from "react";
import { TopicReportButton } from "@/components/topics/topic-report-button";

/**
 * Başlık üstündeki ⋮ menüsü. Deseni entry aksiyon şeridindeki `EntryOverflowMenu`
 * ile aynı (`src/components/entries/entry-actions.tsx`): tetikleyici tek bir
 * etiketli ikon düğmesi, içerik Radix `DropdownMenu`.
 *
 * Buraya yalnız **yazara ve moderasyona** ait işlemler girer. Paylaşım artık
 * burada DEĞİL, kendi ikonunun arkasında (`topic-share-menu.tsx`): iki kıyas
 * ürününde de ⋮ şikâyet/moderasyon çekmecesi (ekşi: mesaj gönder · şikayet ·
 * modlog · engelle, Normal Sözlük: yalnız İspiyonla) ve paylaşım ayrı bir ikon
 * (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2 ve §6).
 *
 * Sıralama/pencere/arama gibi okuma akışının içindeki kontroller de menüye
 * GİRMEZ; onlar JS'siz de çalışmak zorunda.
 *
 * Paylaşım çıkınca menüde gammazdan başka öğe kalmadı: yetki yoksa menü BOŞ
 * olurdu ve boş bir ⋮ kullanıcıyı yanıltır. Bu yüzden doluluk kararı artık
 * bileşenin kendisinde — yetkisiz görüntüleyicide (misafir dâhil) hiç render
 * edilmiyor.
 */
export function TopicOverflowMenu({ topicId, canReport }: { topicId: string; canReport: boolean }) {
  const [gammazOpen, setGammazOpen] = useState(false);
  /*
    Gammaz kipi kapanınca odak buraya dönmeli. Kontrollü kipte `TopicReportButton`
    kendi `AlertDialog.Trigger`ını render etmediği için Radix'in odak iadesi
    boşa düşüyordu (Escape / "Vazgeç" / başarılı gönderim: odak `<body>`).
  */
  const trigger = useRef<HTMLButtonElement>(null);
  if (!canReport) return null;
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
            <DropdownMenu.Item onSelect={() => setGammazOpen(true)} className="menu-item">
              <Flag aria-hidden="true" size={16} />
              Başlığı gammazla
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {/*
        Gammaz kipi menüden açılıyor: kontrollü kipte `TopicReportButton` kendi
        tetikleyicisini render etmez ve kapalıyken hiç DOM üretmez, bu yüzden
        başlık satırının yüksekliğine dokunmaz.
      */}
      <TopicReportButton
        topicId={topicId}
        open={gammazOpen}
        onOpenChange={setGammazOpen}
        returnFocusRef={trigger}
      />
    </>
  );
}
