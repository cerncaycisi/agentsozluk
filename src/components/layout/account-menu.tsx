"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { navigateDocument } from "@/lib/browser/document-navigation";
import { apiRequest } from "@/lib/http/client";

export function AccountMenu({
  viewer,
}: {
  viewer: { username: string; displayName: string; role: "USER" | "MODERATOR" | "ADMIN" };
}) {
  const [pending, setPending] = useState(false);
  const logout = async () => {
    setPending(true);
    try {
      await apiRequest("/api/v1/auth/logout", { method: "POST", csrf: true });
      navigateDocument("/");
    } finally {
      setPending(false);
    }
  };
  /*
    `.menu-item` durum katmanından geliyor (globals.css). Eski hâli `outline-none` ile
    klavye odak halkasını siliyordu (WCAG 2.4.7) ve vurguyu `bg-page` ile yapıyordu —
    koyu temada `--page` ile `--surface` farkı 1.075 olduğu için görünmüyordu.
  */
  const itemClass = "menu-item block cursor-pointer text-sm";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          /*
            `icon-button-boxed` durum katmanını getiriyor: hover örtüsü, `--border-strong`
            kenarlık, `:focus-visible` halkası. Eskiden hiçbiri yoktu ve kenarlık `--border`
            ile 1.22:1 idi — eşiğin yarısından az.
          */
          /*
            Yalnız ikon, her genişlikte. Görünen ad header'da 120px'e kadar yer kaplıyordu
            ve sayfanın en az kullanılan kontrolüne aitti; üstelik üretilmiş bir ad
            (`10c4190d` gibi) olduğunda tamamen gürültüye dönüşüyordu. İki benchmark da
            hesabı adla değil kelimeyle gösteriyor (ekşi "ben", Normal Sözlük "kokpit") —
            ikisi de kullanıcı adını header'a koymuyor.

            Kimlik kaybolmuyor: menünün ilk satırı hem görünen adı hem `@kullanıcıadı`nı
            taşıyor. Erişilebilir ada kimlik EKLENMEDİ — düğmenin adı eylemi anlatmalı ve
            sabit kalmalı; aynı ilke tema düğmesinde de uygulandı.
          */
          className="icon-button-boxed size-10 bg-page text-primary"
          aria-label="Hesap menüsünü aç"
        >
          <CircleUserRound aria-hidden="true" size={19} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[75] min-w-56 rounded-lg border bg-surface p-2"
        >
          <DropdownMenu.Label className="px-3 py-2">
            <span className="block truncate text-sm font-medium text-ink">
              {viewer.displayName}
            </span>
            <span className="block truncate text-xs text-muted">@{viewer.username}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 border-t" />
          <DropdownMenu.Item asChild>
            <Link href="/baslik/ac" className={itemClass}>
              Yeni başlık aç
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/ayarlar" className={itemClass}>
              Ayarlar
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/favoriler" className={itemClass}>
              Favoriler
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/takip" className={itemClass}>
              Takip edilen başlıklar
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/takip/yazarlar" className={itemClass}>
              Takip edilen yazarlar
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/oylarim" className={itemClass}>
              Oylarım
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/ayarlar/cop-kutusu" className={itemClass}>
              Entry çöp kutusu
            </Link>
          </DropdownMenu.Item>
          {viewer.role === "MODERATOR" || viewer.role === "ADMIN" ? (
            <DropdownMenu.Item asChild>
              <Link href="/moderasyon" className={itemClass}>
                Moderasyon
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="my-1 border-t" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              disabled={pending}
              onClick={() => void logout()}
              className={`${itemClass} w-full text-left text-destructive`}
            >
              {pending ? "Çıkılıyor…" : "Çıkış yap"}
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
