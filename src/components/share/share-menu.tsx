"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  aiShareChannels,
  socialShareChannels,
  type ShareTarget,
} from "@/components/share/share-links";

/**
 * Paylaşım menüsü — kendi ikonunun arkasında, `⋮`'den AYRI.
 *
 * Ayrım bir bilgi mimarisi kararı ve iki kıyas ürünü de aynısını yapıyor
 * (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2 ve §6): paylaşım kendi ikonunda,
 * `⋮` ise yazara ve moderasyona ait (ekşi: mesaj gönder · şikayet · modlog ·
 * engelle; Normal Sözlük: İspiyonla). Paylaşımı `⋮` içine koyan eski spec
 * yanlıştı — okuyucunun en sık isteyeceği ikincil eylem, onu şikâyet ve engelle
 * ile aynı çekmeceye kilitliyordu.
 *
 * Menü üç grup:
 *   1. Yapay zekâ kanalları — EN ÜSTTE. İki kıyasta da yok, bizim gerçek
 *      farklılaşmamız; sosyal kanalların arasında kaybolmasın diye kendi
 *      başlıklı grubunda ve ilk sırada.
 *   2. Sosyal kanallar.
 *   3. Kopyalama öğeleri — çağıran veriyor (`children`), çünkü kopyalanacak şey
 *      bağlama göre değişiyor (başlıkta link, entry'de link + entry numarası).
 *
 * Alt menü (Radix `Sub`) bilerek kullanılmıyor: düz liste klavyede tek eksende
 * gezilir, sağ/sol ok öğrenmeyi gerektirmez ve baş harfe basınca (type-ahead)
 * kanal doğrudan bulunur. Grupları `DropdownMenu.Label` ayırıyor, her grup
 * `aria-labelledby` ile o etikete bağlı.
 *
 * Kanalların hepsi düz `<a href>`; hiçbir harici script yüklenmiyor.
 * `rel="nofollow noopener noreferrer"`: bu linkler editoryal bir tavsiye değil
 * (nofollow), ve hedef sayfaya `window.opener` / referrer sızdırmıyoruz.
 */

const GROUP_LABEL_CLASS = "px-3 py-2 text-xs font-medium text-muted";

function ChannelItems({ channels }: { channels: readonly ShareTarget[] }) {
  return (
    <>
      {channels.map((channel) => (
        <DropdownMenu.Item key={channel.id} asChild>
          <a
            href={channel.href}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="menu-item"
          >
            {channel.label}
          </a>
        </DropdownMenu.Item>
      ))}
    </>
  );
}

/** Kopyalama öğesi; işi çağıran yapıyor (`useShareCopy`), menü yalnız gösteriyor. */
export function ShareCopyItem({
  icon,
  label,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item onSelect={() => onSelect()} className="menu-item">
      {icon}
      {label}
    </DropdownMenu.Item>
  );
}

export function ShareMenu({
  triggerLabel,
  triggerClassName = "icon-button",
  aiPrompt,
  url,
  shareText,
  onCloseAutoFocus,
  children,
}: {
  triggerLabel: string;
  /**
   * Varsayılan çıplak `.icon-button`: entry aksiyon şeridi bir İÇERİK satırıdır,
   * orada kutu yok — o şeridin mürekkep kaplaması bu turda %5,87'den %3'e
   * indirildi (`76c525d`) ve paylaşım ikonu onu geri getirmemeli. Başlık satırı
   * kendi komşularına (`chip` takip düğmesi, `chip` ⋮) uyması için sınıfı
   * dışarıdan geçiyor.
   */
  triggerClassName?: string;
  aiPrompt: string;
  /** MUTLAK adres: paylaşılan link başka bir uygulamaya gidiyor, göreli yol oraya gitmez. */
  url: string;
  /** Sosyal kanala gidecek metin; yoksa yalnız adres paylaşılır. */
  shareText?: string;
  onCloseAutoFocus?: (event: Event) => void;
  /** Kopyalama grubu: `ShareCopyItem` öğeleri. */
  children?: ReactNode;
}) {
  const aiLabelId = useId();
  const socialLabelId = useId();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={triggerLabel} className={triggerClassName}>
          <Share2 aria-hidden="true" size={17} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[75] min-w-56 rounded-lg border bg-surface p-2"
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        >
          <DropdownMenu.Group aria-labelledby={aiLabelId}>
            <DropdownMenu.Label id={aiLabelId} className={GROUP_LABEL_CLASS}>
              Yapay zekâya sor
            </DropdownMenu.Label>
            <ChannelItems channels={aiShareChannels(aiPrompt)} />
          </DropdownMenu.Group>
          <DropdownMenu.Separator className="my-1 border-t" />
          <DropdownMenu.Group aria-labelledby={socialLabelId}>
            <DropdownMenu.Label id={socialLabelId} className={GROUP_LABEL_CLASS}>
              Sosyal ağlarda paylaş
            </DropdownMenu.Label>
            <ChannelItems
              channels={socialShareChannels({ url, ...(shareText ? { text: shareText } : {}) })}
            />
          </DropdownMenu.Group>
          {children ? (
            <>
              <DropdownMenu.Separator className="my-1 border-t" />
              {children}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export type ShareCopyRequest = {
  /** Panoya yazılacak değer. */
  value: string;
  successMessage: string;
  errorMessage: string;
  /** Yedek kutunun `id`'si — etiketle eşleşmesi için çağıran belirliyor. */
  fallbackId: string;
  fallbackLabel: string;
};

/**
 * Kopyalama davranışı. Pano API'si yoksa (güvensiz bağlam, eski tarayıcı) ya da
 * izin reddedilirse tek bir çıkış yolu var: değeri seçili bir kutuda göster.
 * `document.execCommand("copy")` bilerek kullanılmıyor — kullanımdan kalktı.
 *
 * Hiçbir dalda sessiz kalınmıyor; başarı da başarısızlık da toast ile duyuruluyor.
 *
 * Yedek kutusu açıldığında odak oraya gitmeli, menü tetikleyicisine değil: seçili
 * metin ancak odaklı bir kutuda kopyalanabilir. Pano API'si hiç yokken hata menü
 * kapanmadan önce (mikro görevde) biliniyor, bu yüzden Radix'in odak iadesini bu
 * bayrakla iptal ediyoruz. İzin reddi geç gelirse iade zaten olup bitmiş olur; o
 * durumda kutunun kendi `focus()` çağrısı yeterli.
 */
export function useShareCopy() {
  const [fallback, setFallback] = useState<{ id: string; label: string; value: string }>();
  const claimFocusForFallback = useRef(false);
  const copy = async (request: ShareCopyRequest) => {
    try {
      const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clipboard?.writeText) throw new Error("Pano API'si kullanılamıyor.");
      await clipboard.writeText(request.value);
      setFallback(undefined);
      toast.success(request.successMessage);
    } catch {
      claimFocusForFallback.current = true;
      setFallback({ id: request.fallbackId, label: request.fallbackLabel, value: request.value });
      toast.error(request.errorMessage);
    }
  };
  const handleCloseAutoFocus = (event: Event) => {
    if (!claimFocusForFallback.current) return;
    claimFocusForFallback.current = false;
    event.preventDefault();
  };
  return { copy, fallback, handleCloseAutoFocus };
}

/**
 * Pano yedeği: salt okunur, içeriği seçili bir kutu. Kullanıcı yalnız kopyalama
 * kısayoluna basar.
 *
 * Odak iki kez alınıyor: menü kapanırken Radix odağı tetikleyiciye geri
 * döndürüyor, o geri dönüş bizim ilk odağımızdan sonraya düşebilir. Bir sonraki
 * karede tekrarlamak yarışı çözüyor; ilk çağrı da kalıyor ki `requestAnimationFrame`
 * hiç çalışmasa bile metin seçili olsun.
 */
export function ShareCopyFallback({
  id,
  label,
  value,
  wrapperClassName = "w-full",
}: {
  id: string;
  label: string;
  value: string;
  /**
   * Kutunun nereye oturacağını çağıran bilir. Entry şeridi sarabilen bir
   * `flex` footer: orada `w-full` kutuyu kendi satırına indirir. Başlık satırı
   * sarmayan bir kontrol grubu; orada kutu satırı taşırmasın diye tetikleyicinin
   * altına mutlak konumlanır.
   */
  wrapperClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
    const frame = requestAnimationFrame(() => {
      node.focus();
      node.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className="block text-sm text-muted">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        readOnly
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        className="field-border mt-1 w-full rounded-lg border bg-page px-3 py-2 text-sm"
      />
    </div>
  );
}
