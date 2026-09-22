"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const GOOGLE_TAG_MANAGER_ID = "GTM-MTGXSB7H";

/*
  Çerez onayı (22 Eylül 2026, Gökhan kararı): ölçüm etiketi ziyaretçi "Kabul et"
  demeden YÜKLENMEZ. Hotjar kaldırıldı. Onay birinci taraf bir çerezde 180 gün
  tutulur; "Reddet" de hatırlanır, şerit bir daha sorulmaz. Tercih gizlilik
  sayfasından sıfırlanabilir. JavaScript yoksa onay alınamayacağı için
  `<noscript>` izleme iframe'i de yoktur.

  Sunucu tarafı `enabled` kararı (anonim ziyaretçi, herkese açık yüzey, üretim
  sitesi, DNT/GPC yok) aynen geçerlidir: o koşullar yoksa şerit de çıkmaz.
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

export function cerezTercihiniSifirla() {
  document.cookie = `${CEREZ_ONAYI_ADI}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function ProductAnalytics({
  enabled,
  nonce,
}: {
  enabled: boolean;
  nonce?: string | undefined;
}) {
  // Sunucuda ve ilk çizimde karar bilinmez: hiçbir şey çizilmez (hidrasyon uyumu).
  const [onay, setOnay] = useState<Onay | null | undefined>(undefined);

  useEffect(() => {
    if (enabled) setOnay(onayiOku());
  }, [enabled]);

  if (!enabled || onay === undefined || onay === "red") return null;

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
          Siteyi nasıl kullandığınızı anlamak için Google Analytics ile anonim ölçüm yapmak
          istiyoruz. Kabul etmezseniz ölçüm etiketi hiç yüklenmez. Ayrıntı:{" "}
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
