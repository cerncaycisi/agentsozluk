"use client";

import { Link2 } from "lucide-react";
import {
  ShareCopyFallback,
  ShareCopyItem,
  ShareMenu,
  useShareCopy,
} from "@/components/share/share-menu";
import { topicAiSharePrompt } from "@/components/share/share-links";

/**
 * Başlık seviyesindeki paylaşım. `⋮`'den ayrı, kendi ikonunun arkasında
 * (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2).
 *
 * Tetikleyici `chip`: başlık satırındaki komşuları (takip düğmesi, ⋮) çerçeveli
 * ve bu satır entry akışının değil, başlığın denetim satırı. Entry şeridindeki
 * paylaşım ikonu ise çıplak `.icon-button` — orada kutu, iki satırlık metnin
 * yanında bir çerçeve daha demek.
 *
 * Sosyal kanala giden metin başlığın kendisi: `/baslik/<slug>--<id>` adresi
 * ASCII slug taşıdığı için paylaşımın gövdesinde başlığın gerçek yazımı ancak
 * bu metinle görünür.
 */
export function TopicShareMenu({
  title,
  /** MUTLAK adres: kopyalanan ya da bir araca gönderilen göreli yol hiçbir yere gitmez. */
  url,
}: {
  title: string;
  url: string;
}) {
  const { copy, fallback, handleCloseAutoFocus } = useShareCopy();
  return (
    /*
      Pano yedeği başlık satırını taşırmasın diye tetikleyicinin ALTINA mutlak
      konumlanıyor: kimlik satırı (başlık + takip + paylaş + ⋮) sarmayan bir
      kontrol grubu, oraya `w-full` bir kutu koymak satırı bozardı. Entry
      şeridinde durum tersi — orası saran bir footer, kutu kendi satırına iner.
    */
    <span className="relative inline-flex">
      <ShareMenu
        triggerLabel="Başlığı paylaş"
        triggerClassName="chip w-9 justify-center px-0 text-ink"
        aiPrompt={topicAiSharePrompt({ title, url })}
        url={url}
        shareText={title}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <ShareCopyItem
          icon={<Link2 aria-hidden="true" size={16} />}
          label="Linki kopyala"
          onSelect={() =>
            void copy({
              value: url,
              successMessage: "Link kopyalandı.",
              errorMessage:
                "Link panoya kopyalanamadı. Aşağıdaki kutudan elle kopyalayabilirsiniz.",
              fallbackId: "baslik-link-kopyala",
              fallbackLabel: "Pano kullanılamadı; linki buradan kopyalayın",
            })
          }
        />
      </ShareMenu>
      {fallback ? (
        <ShareCopyFallback
          {...fallback}
          wrapperClassName="absolute right-0 top-full z-[60] mt-2 w-[min(22rem,70vw)] rounded-lg border bg-surface p-3"
        />
      ) : null}
    </span>
  );
}
