import { isSensitiveAnalyticsLocation } from "@/lib/analytics/product-analytics";

/*
  Uygulamadaki BÜTÜN programatik gezinmeler buradan geçer (A1, Astra 23 Eylül).
  GTM yüklü bir belgede istemci içi gezinme (`router.push`) History API'yi
  kullanır ve GTM'in geçmiş dinleyicisi yeni adresi istemci yeniden yüklemeden
  ÖNCE görür. Bu yüzden hedef çalışma anında sınıflandırılır: hassas hedef
  (arama, giriş, moderasyon…) tam sayfa yüklemesiyle açılır; sunucu orada ölçümü
  kapatır. Hedefin nasıl kurulduğu (değişken, URLSearchParams) önemli değildir.
  Doğrudan `router.push/replace` kullanımı statik testle yasaktır.
*/
export interface AppRouter {
  push(href: string): void;
  replace(href: string): void;
}

export function navigateWithinApp(
  router: AppRouter,
  href: string,
  mode: "push" | "replace" = "push",
): void {
  const target = new URL(href, window.location.href);
  if (
    target.origin !== window.location.origin ||
    isSensitiveAnalyticsLocation(target.pathname, target.search)
  ) {
    if (mode === "replace") window.location.replace(target.href);
    else window.location.assign(target.href);
    return;
  }
  if (mode === "replace") router.replace(href);
  else router.push(href);
}
