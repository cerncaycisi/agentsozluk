"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gtmYuklendiMi, gtmYuklendiOlarakIsaretle } from "@/lib/analytics/gtm-state";
import { isSensitiveAnalyticsLocation } from "@/lib/analytics/product-analytics";

const GOOGLE_TAG_MANAGER_ID = "GTM-MTGXSB7H";
const HOTJAR_SITE_ID = 6753780;
const HOTJAR_SNIPPET_VERSION = 6;

/*
  Çerez onayı (22 Eylül 2026): ölçüm etiketleri (GTM/GA4 ve Hotjar) ziyaretçi
  "Kabul et" demeden YÜKLENMEZ. Onay birinci taraf bir çerezde 180 gün
  tutulur; "Reddet" de hatırlanır. JavaScript yoksa onay alınamayacağı için
  `<noscript>` izleme iframe'i de yoktur.

  Kapı İKİ katmanlıdır (Sol, 22 Eylül):
   - Sunucu: `enabled` (anonim, herkese açık yüzey, üretim sitesi, DNT/GPC yok)
     yalnız TAM sayfa yüklemesinde değerlendirilir; kök layout sayfa içi
     gezinmede korunur.
   - İstemci: her adres değişiminde yüzey ve tarayıcının DNT/GPC sinyali yeniden
     değerlendirilir; hassas bir yüzeyde şerit çıkmaz, onay alınmaz.
  GTM bir kez yüklendikten sonra belgeden sökülemez (next/script kaldırmaz).
  Bu yüzden GTM yüklü bir belgede:
   - hassas bir adrese giden bağlantı tıklaması belge düzeyinde, yakalama
     aşamasında karşılanır ve Next yönlendiricisine ulaşmadan TAM sayfa
     yüklemesine çevrilir; sunucu o sayfada ölçümü kapatır. (History API'si
     sarmalanmaz: GTM de onu sarmaladığı için zincir kırılgandı — Sol.)
   - adres yine de hassaslaşırsa, onay başka bir sekmede geri çekilirse ya da
     sekmeye/geri tuşu önbelleğinden dönülürken onay geçersizse sayfa yeniden
     yüklenir.
*/
export const CEREZ_ONAYI_ADI = "as_cerez_onayi";
/*
  Onay KAPSAMI sürümlüdür (Astra, 22 Eylül): v1 şeridi yalnız Google
  Analytics'ten bahsediyordu; Hotjar eklenince eski "kabul" yeni kapsama onay
  sayılmaz, şerit yeniden sorar. Kapsam yine değişirse sürüm artırılır. Ret
  (daha az izin) sürümden bağımsız geçerlidir.
*/
export const CEREZ_KABUL_DEGERI = "kabul-v2";
const CEREZ_ONAYI_OMRU_SN = 180 * 24 * 60 * 60;

type Onay = "kabul" | "red";

function onayiOku(): Onay | null {
  const deger = document.cookie
    .split(";")
    .map((parca) => parca.trim())
    .find((parca) => parca.startsWith(`${CEREZ_ONAYI_ADI}=`))
    ?.slice(CEREZ_ONAYI_ADI.length + 1);
  if (deger === CEREZ_KABUL_DEGERI) return "kabul";
  if (deger === "red") return "red";
  return null;
}

function onayiYaz(onay: Onay) {
  const guvenli = window.location.protocol === "https:" ? "; Secure" : "";
  const deger = onay === "kabul" ? CEREZ_KABUL_DEGERI : "red";
  document.cookie = `${CEREZ_ONAYI_ADI}=${deger}; Path=/; Max-Age=${CEREZ_ONAYI_OMRU_SN}; SameSite=Lax${guvenli}`;
}

function tarayiciIzlemeyiReddediyor(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

function cerezSil(ad: string) {
  const alanAdi = window.location.hostname;
  document.cookie = `${ad}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${ad}=; Path=/; Max-Age=0; Domain=${alanAdi}`;
  const ust = alanAdi.split(".").slice(-2).join(".");
  if (ust !== alanAdi) document.cookie = `${ad}=; Path=/; Max-Age=0; Domain=.${ust}`;
}

/** Tercihi, Google Analytics ve Hotjar çerezlerini siler, sayfayı yeniden yükler (etiketler belgeden gider). */
export function cerezTercihiniSifirla() {
  cerezSil(CEREZ_ONAYI_ADI);
  for (const parca of document.cookie.split(";")) {
    const ad = parca.split("=")[0]?.trim();
    if (ad && (ad === "_ga" || ad.startsWith("_ga_") || ad === "_gid" || ad.startsWith("_hj")))
      cerezSil(ad);
  }
  window.location.reload();
}

function hassasBaglanti(olay: MouseEvent): string | null {
  if (olay.defaultPrevented || olay.button !== 0) return null;
  if (olay.metaKey || olay.ctrlKey || olay.shiftKey || olay.altKey) return null;
  const hedef = olay.target instanceof Element ? olay.target.closest("a[href]") : null;
  if (!(hedef instanceof HTMLAnchorElement)) return null;
  if (hedef.target && hedef.target !== "_self") return null;
  if (hedef.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(hedef.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  return isSensitiveAnalyticsLocation(url.pathname, url.search) ? url.href : null;
}

/**
 * GTM yüklü belgede hassas bağlantıları tam sayfa yüklemesine çevirir (yakalama
 * aşaması). Söküm işlevi döner; yalnız bileşen kaldırılırken çağrılır.
 */
function hassasGecisleriKoru(): () => void {
  // `window` yakalama aşaması, `document` üzerindeki (GTM dahil) bütün
  // dinleyicilerden önce çalışır; olay oraya hiç inmez (Sol, üçüncü tur).
  const tiklama = (olay: MouseEvent) => {
    const adres = hassasBaglanti(olay);
    if (!adres) return;
    olay.preventDefault();
    olay.stopImmediatePropagation();
    window.location.assign(adres);
  };
  // Geri/ileri hassas bir girdiye dönerse: aynı `window` üzerindeki sonraki
  // dinleyiciler (GTM'in geçmiş dinleyicisi, GTM'den önce kaydedildiğimiz için)
  // susturulur ve belge yeniden yüklenir.
  const geriIleri = (olay: PopStateEvent) => {
    if (!isSensitiveAnalyticsLocation(window.location.pathname, window.location.search)) return;
    olay.stopImmediatePropagation();
    window.location.reload();
  };
  window.addEventListener("click", tiklama, true);
  window.addEventListener("popstate", geriIleri, true);
  return () => {
    window.removeEventListener("click", tiklama, true);
    window.removeEventListener("popstate", geriIleri, true);
  };
}

/*
  Hassas konumdan (arama, giriş…) çıkan gezinme, adresi ve sorgusu bir sonraki
  belgenin `document.referrer`'ına taşımasın: o belge herkese açık ve ölçülüyor
  olabilir (Astra, A1). Belgenin referrer politikası `<meta name="referrer">`
  ile adres değiştikçe güncellenir; içerik değişikliği tarayıcıca yeniden
  uygulanır.
*/
export const HASSAS_REFERRER_POLITIKASI = "origin";
export const VARSAYILAN_REFERRER_POLITIKASI = "strict-origin-when-cross-origin";

function referrerPolitikasiniUygula(hassas: boolean) {
  let etiket = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!etiket) {
    if (!hassas) return;
    etiket = document.createElement("meta");
    etiket.name = "referrer";
    document.head.append(etiket);
  }
  etiket.content = hassas ? HASSAS_REFERRER_POLITIKASI : VARSAYILAN_REFERRER_POLITIKASI;
}

/** Onay artık geçerli değilse (başka sekmede geri çekilmiş, DNT/GPC açılmış) yeniden yükle. */
function onayHalaGecerliMi(): boolean {
  return onayiOku() === "kabul" && !tarayiciIzlemeyiReddediyor();
}

const GTM_KODU = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');`;

const HOTJAR_KODU = `(function(h,o,t,j,a,r){
h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
h._hjSettings={hjid:${HOTJAR_SITE_ID},hjsv:${HOTJAR_SNIPPET_VERSION}};
a=o.getElementsByTagName('head')[0];
r=o.createElement('script');r.async=1;
r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
a.appendChild(r);
})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`;

/** GTM ve Hotjar satır içi etiketlerini CSP nonce'uyla `<head>`'e ekler (bir kez). */
function olcumEtiketleriniEkle(nonce: string | undefined) {
  for (const [id, kod] of [
    ["google-tag-manager", GTM_KODU],
    ["hotjar-tracking", HOTJAR_KODU],
  ] as const) {
    if (document.getElementById(id)) continue;
    const etiket = document.createElement("script");
    etiket.id = id;
    if (nonce) etiket.nonce = nonce;
    etiket.textContent = kod;
    document.head.appendChild(etiket);
  }
}

export function ProductAnalytics({
  enabled,
  nonce,
}: {
  enabled: boolean;
  nonce?: string | undefined;
}) {
  const pathname = usePathname();
  // Yalnız sorgusu değişen istemci içi gezinme (ör. başlık içi aramanın sayfaları)
  // yolu değiştirmez; yüzey sorguyla birlikte değerlendirilir (A1).
  const search = useSearchParams()?.toString() ?? "";
  const hassas = isSensitiveAnalyticsLocation(pathname, search);
  // Sunucuda ve ilk çizimde karar bilinmez: hiçbir şey çizilmez (hidrasyon uyumu).
  const [onay, setOnay] = useState<Onay | null | undefined>(undefined);
  const [izlemeReddi, setIzlemeReddi] = useState(true);
  // Yüzey render sırasında adresten türetilir: hassas sayfada şerit bir kare bile kalmaz.
  const istemciUygun = enabled && !hassas && !izlemeReddi;

  useEffect(() => {
    referrerPolitikasiniUygula(hassas);
  }, [hassas]);

  useEffect(() => {
    const ret = tarayiciIzlemeyiReddediyor();
    setIzlemeReddi(ret);
    // GTM yüklü belgede hassas yüzeye gelinmişse ya da onay geri çekilmişse: tam yükleme.
    if (gtmYuklendiMi() && (hassas || !onayHalaGecerliMi())) {
      window.location.reload();
      return;
    }
    if (enabled) setOnay(onayiOku());
    // Her adres değişiminde (yol YA DA sorgu) yeniden değerlendirilir; yalnız
    // `hassas` değişince koşsaydı onayı geri çekilmiş herkese açık gezinme kaçardı.
  }, [enabled, hassas, pathname, search]);

  useEffect(() => {
    const denetle = () => {
      if (gtmYuklendiMi() && !onayHalaGecerliMi()) window.location.reload();
    };
    const geriDonus = (olay: PageTransitionEvent) => {
      if (olay.persisted) denetle();
    };
    const gorunurluk = () => {
      if (document.visibilityState === "visible") denetle();
    };
    window.addEventListener("pageshow", geriDonus);
    window.addEventListener("focus", denetle);
    document.addEventListener("visibilitychange", gorunurluk);
    return () => {
      window.removeEventListener("pageshow", geriDonus);
      window.removeEventListener("focus", denetle);
      document.removeEventListener("visibilitychange", gorunurluk);
    };
  }, []);

  const yukle = istemciUygun && onay === "kabul";
  // Koruma GTM ilk yüklendiğinde kurulur ve GTM belgede kaldıkça durur; yalnız
  // bileşen kaldırılırken sökülür (kök layout'ta pratikte hiç).
  const korumaSokumu = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!yukle || korumaSokumu.current) return;
    /*
      Karar ve enjeksiyon AYNI görevde (A1, Astra 5. tur): `yukle` önceki render'ın
      adresinden türedi; render ile bu effect arasında tarayıcı hassas bir adrese
      dönmüş olabilir. Gerçek adres burada yeniden denetlenir ve etiketler hemen
      eklenir; `next/script`'in kendi effect'ini beklemek araya yeni bir pencere
      açardı. Adres hassassa hiçbir şey yüklenmez; sonraki render `yukle`'yi düşürür.
    */
    if (isSensitiveAnalyticsLocation(window.location.pathname, window.location.search)) return;
    korumaSokumu.current = hassasGecisleriKoru();
    gtmYuklendiOlarakIsaretle();
    olcumEtiketleriniEkle(nonce);
  }, [yukle, nonce]);
  useEffect(
    () => () => {
      korumaSokumu.current?.();
      korumaSokumu.current = null;
    },
    [],
  );

  if (!istemciUygun || onay === undefined || onay === "red") return null;

  // Etiketler effect'te eklenir (yukarıda); kabul edilmiş onayda çizilecek şerit yok.
  if (onay === "kabul") return null;

  const sec = (secim: Onay) => {
    onayiYaz(secim);
    setOnay(secim);
  };

  return (
    <div
      role="region"
      aria-label="Çerez tercihi"
      // Renk değişkenleri RGB üçlüsüdür (`255 255 255`); `bg-[var(--surface)]` geçersiz
      // renk olur ve şerit SAYDAM kalır. Sitenin geri kalanı gibi `bg-surface`.
      className="fixed inset-x-0 bottom-0 z-[70] border-t bg-surface p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Siteyi nasıl kullandığınızı anlamak için Google Analytics ve Hotjar ile ölçüm yapmak
          istiyoruz. Kabul etmezseniz ölçüm etiketleri hiç yüklenmez. Ayrıntı:{" "}
          <a href="/gizlilik" className="underline">
            gizlilik
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="button-secondary" onClick={() => sec("red")}>
            Reddet
          </button>
          <button type="button" className="button-primary" onClick={() => sec("kabul")}>
            Kabul et
          </button>
        </div>
      </div>
    </div>
  );
}
