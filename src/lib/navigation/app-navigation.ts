import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { gtmYuklendiMi } from "@/lib/analytics/gtm-state";
import { isSensitiveAnalyticsLocation } from "@/lib/analytics/product-analytics";

/*
  Uygulamadaki BÜTÜN programatik gezinmeler buradan geçer (A1, Astra 23 Eylül).
  GTM yüklü bir belgede istemci içi gezinme (`router.push`) History API'yi
  kullanır ve GTM'in geçmiş dinleyicisi yeni adresi istemci yeniden yüklemeden
  ÖNCE görür. Bu yüzden hedef çalışma anında sınıflandırılır: GTM yüklü belgede
  hassas hedef (arama, giriş, moderasyon…) tam sayfa yüklemesiyle açılır; sunucu
  orada ölçümü kapatır. GTM yüklenmemiş belgede (ör. zaten hassas olan moderasyon
  sayfası) dinleyen etiket yoktur; gezinme istemci içinde kalır, bildirimler
  kaybolmaz. Hedefin nasıl kurulduğu (değişken, URLSearchParams) önemli değildir.

  Next'in ham router'ı yalnız bu dosyada alınır: `next/navigation`'dan
  `useRouter` importu ve History API ESLint ile yasaktır (`eslint.config.mjs`).
  Bileşenler `useAppRouter()` kullanır; router prop olarak aktarılsa ya da
  `push` yapı bozmayla alınsa da korumalı olan aktarılır.
*/
export interface AppRouter {
  push(href: string): void;
  replace(href: string): void;
}

export interface GuardedRouter extends AppRouter {
  refresh(): void;
}

export function navigateWithinApp(
  router: AppRouter,
  href: string,
  mode: "push" | "replace" = "push",
): void {
  const target = new URL(href, window.location.href);
  if (
    target.origin !== window.location.origin ||
    (gtmYuklendiMi() && isSensitiveAnalyticsLocation(target.pathname, target.search))
  ) {
    if (mode === "replace") window.location.replace(target.href);
    else window.location.assign(target.href);
    return;
  }
  if (mode === "replace") router.replace(href);
  else router.push(href);
}

export function useAppRouter(): GuardedRouter {
  const router = useRouter();
  return useMemo(
    () => ({
      push: (href: string) => navigateWithinApp(router, href),
      replace: (href: string) => navigateWithinApp(router, href, "replace"),
      refresh: () => router.refresh(),
    }),
    [router],
  );
}
