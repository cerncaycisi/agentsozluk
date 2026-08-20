"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, CircleUserRound } from "lucide-react";
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
          className="icon-button-boxed min-h-10 min-w-10 bg-page text-sm font-semibold text-primary sm:w-auto sm:max-w-40 sm:gap-1 sm:px-3"
          aria-label="Hesap menüsünü aç"
        >
          <CircleUserRound aria-hidden="true" size={19} className="sm:hidden" />
          <span className="hidden truncate sm:inline">{viewer.displayName}</span>
          <ChevronDown aria-hidden="true" size={16} className="hidden sm:block" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[75] min-w-56 rounded-lg border bg-surface p-2"
        >
          <DropdownMenu.Label className="px-3 py-2 text-xs font-medium text-muted">
            @{viewer.username}
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
