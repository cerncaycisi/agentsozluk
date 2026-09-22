"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isSensitiveAnalyticsPath } from "@/lib/analytics/product-analytics";

const GOOGLE_TAG_MANAGER_ID = "GTM-MTGXSB7H";

/*
  Çerez onayı (22 Eylül 2026, Gökhan kararı): ölçüm etiketi ziyaretçi "Kabul et"
  demeden YÜKLENMEZ. Hotjar kaldırıldı. Onay birinci taraf bir çerezde 180 gün
  tutulur; "Reddet" de hatırlanır. JavaScript yoksa onay alınamayacağı için
  `<noscript>` izleme iframe'i de yoktur.

  Kapı İKİ katmanlıdır (Sol, 22 Eylül):
   - Sunucu: `enabled` (anonim, herkese açık yüzey, üretim sitesi, DNT/GPC yok)
     yalnız TAM sayfa yüklemesinde değerlendirilir; kök layout sayfa içi
     gezinmede korunur.
   - İstemci: her adres değişiminde yüzey ve tarayıcının DNT/GPC sinyali yeniden
     değerlendirilir; hassas bir yüzeyde şerit çıkmaz, onay alınmaz.
  GTM bir kez yüklendikten sonra belgeden sökülemez (next/script kaldırmaz).
  Bu yüzden GTM yüklü bir belgede hassas bir adrese geçiş TAM sayfa yüklemesine
  çevrilir — sunucu o sayfada ölçümü kapatır — ve geçiş GTM'e görünmez.
  Tercih sıfırlanınca ya da geri tuşu önbelleğinden dönülünce onay geçersizse
  sayfa yeniden yüklenir.
*/
export const CEREZ_ONAYI_ADI = "as_cerez_onayi";
const CEREZ_ONAYI_OMRU_SN = 180 * 24 * 60 * 60;

type Onay = "kabul" | "red";

function onayiOku(): Onay | null {
  const deger = document.cookie
    .split(";")
    .map((parca) => parca.trim())
    .find((parca) => parca.startsWith(`${CEREZ_ONAYI_ADI}=`))
    ?.slice(CEREZ_ONAYI_ADI.length + 1);
  return deger === "kabul" || deger === "red" ? deger : null;
}

function onayiYaz(onay: Onay) {
  const guvenli = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CEREZ_ONAYI_ADI}=${onay}; Path=/; Max-Age=${CEREZ_ONAYI_OMRU_SN}; SameSite=Lax${guvenli}`;
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

/** Tercihi ve Google Analytics çerezlerini siler, sayfayı yeniden yükler (GTM belgeden gider). */
export function cerezTercihiniSifirla() {
  cerezSil(CEREZ_ONAYI_ADI);
  for (const parca of document.cookie.split(";")) {
    const ad = parca.split("=")[0]?.trim();
    if (ad && (ad === "_ga" || ad.startsWith("_ga_") || ad === "_gid")) cerezSil(ad);
  }
  window.location.reload();
}

// Bu belgede GTM yüklendi mi? Yüklendiyse sökülemez; korumalar buna bakar.
let gtmYuklendi = false;
let korumaKuruldu = false;

function hassasAdres(url: string | URL | null | undefined): boolean {
  if (url == null) return false;
  try {
    return isSensitiveAnalyticsPath(new URL(String(url), window.location.href).pathname);
  } catch {
    return false;
  }
}

/*
  history.pushState/replaceState'i EN DIŞTAN sarar: hassas bir adrese geçiş
  iç sarmalayıcılara (GTM'in geçmiş dinleyicisi dahil) hiç ulaşmaz, tam sayfa
  yüklemesine döner. GTM kendi sarmalayıcısını sonradan eklediği için bir süre
  en dışta kalındığı yeniden doğrulanır.
*/
function hassasGecisleriKoru() {
  if (korumaKuruldu) return;
  korumaKuruldu = true;
  const sar = (ad: "pushState" | "replaceState") => {
    let ic = window.history[ad];
    const sarmalayici = function (
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      if (hassasAdres(url)) {
        window.location.assign(String(url));
        return;
      }
      return ic.call(this, data, unused, url);
    };
    const enDistaTut = () => {
      if (window.history[ad] !== sarmalayici) {
        ic = window.history[ad];
        window.history[ad] = sarmalayici;
      }
    };
    enDistaTut();
    let deneme = 0;
    const zamanlayici = window.setInterval(() => {
      enDistaTut();
      if (++deneme >= 60) window.clearInterval(zamanlayici);
    }, 250);
  };
  sar("pushState");
  sar("replaceState");
  window.addEventListener("popstate", () => {
    if (isSensitiveAnalyticsPath(window.location.pathname)) window.location.reload();
  });
}

export function ProductAnalytics({
  enabled,
  nonce,
}: {
  enabled: boolean;
  nonce?: string | undefined;
}) {
  const pathname = usePathname();
  // Sunucuda ve ilk çizimde karar bilinmez: hiçbir şey çizilmez (hidrasyon uyumu).
  const [onay, setOnay] = useState<Onay | null | undefined>(undefined);
  const [istemciUygun, setIstemciUygun] = useState(false);

  useEffect(() => {
    const uygun = enabled && !isSensitiveAnalyticsPath(pathname) && !tarayiciIzlemeyiReddediyor();
    setIstemciUygun(uygun);
    // GTM yüklü belgede hassas yüzeye bir şekilde gelinmişse: tam yükleme.
    if (gtmYuklendi && !uygun) window.location.reload();
    if (enabled) setOnay(onayiOku());
  }, [enabled, pathname]);

  useEffect(() => {
    const geriDonus = (olay: PageTransitionEvent) => {
      if (!olay.persisted || !gtmYuklendi) return;
      if (onayiOku() !== "kabul" || tarayiciIzlemeyiReddediyor()) window.location.reload();
    };
    window.addEventListener("pageshow", geriDonus);
    return () => window.removeEventListener("pageshow", geriDonus);
  }, []);

  const yukle = enabled && istemciUygun && onay === "kabul";
  useEffect(() => {
    if (yukle) {
      hassasGecisleriKoru();
      gtmYuklendi = true;
    }
  }, [yukle]);

  if (!enabled || !istemciUygun || onay === undefined || onay === "red") return null;

  if (onay === "kabul") {
    return (
      <Script id="google-tag-manager" nonce={nonce} strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');`}
      </Script>
    );
  }

  const sec = (secim: Onay) => {
    onayiYaz(secim);
    setOnay(secim);
  };

  return (
    <div
      role="region"
      aria-label="Çerez tercihi"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Siteyi nasıl kullandığınızı anlamak için Google Analytics ile ölçüm yapmak istiyoruz.
          Kabul etmezseniz ölçüm etiketi hiç yüklenmez. Ayrıntı:{" "}
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
