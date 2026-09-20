import type { NextConfig } from "next";
import path from "node:path";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import {
  ADDITIONAL_HTML_LIMITED_CRAWLERS,
  SEARCH_AND_CITATION_CRAWLERS,
} from "./src/config/crawlers";

const isProduction = process.env.NODE_ENV === "production";

/*
  STREAMING METADATA KAPATMASI — 18 Eylül 2026.

  Next 15.2'den beri `generateMetadata` sonucu varsayılan olarak STREAM edilir:
  `<title>`, `rel=canonical` ve `meta robots` `<head>` bittikten sonra, gövdenin
  içinde basılır. React onları istemcide `<head>`'e taşır.

  Ölçüm (canlı, Googlebot mobil kimliğiyle, 5 ayrı entry sayfası):
    </head> biter  : 3.556. bayt
    <title> başlar : ~34.800. bayt
  Beşinde de aynı. Başlık sayfalarında sorun yok; sorun entry sayfalarında —
  canlıda 18.515 URL. Yerel üretim derlemesinde düzeltme doğrulandı: bot
  kimliklerinde title/canonical `<head>` içinde, gerçek tarayıcıda streaming
  sürüyor.

  Next'in varsayılan listesi Bingbot'u İÇERİR, Googlebot'u İÇERMEZ (`Googlebot`
  ne `[\w-]+-Google` ne `Google-[\w-]+` kalıbına uyar). Ölçüm bunu doğruladı:
  aynı sayfada Bingbot metadata'yı head içinde görürken Googlebot görmüyordu.

  Listeyi ELLE KOPYALAMIYORUZ. İlk yazımda `config-shared.d.ts` içindeki ESKİ
  yorum listesinden kopyalamıştım ve Sol (18 Eylül) yedi kimliğin düştüğünü
  ölçtü: `AdsBot-Google`, `Storebot-Google`, `Google-InspectionTool`,
  `Google-PageRenderer`, `Chrome-Lighthouse`, `Yeti`, `googleweblight`. Artık
  Next'in kendi regex'i UZATILIYOR; sürüm yükseltmesi yeni bot eklerse
  kendiliğinden geliyor, iç yol kaybolursa derleme yüksek sesle düşüyor.

  Eklediklerimizin gerekçesi:
  1. `rel=canonical` ve `meta robots`'un `<head>` içinde olması Google'ın kendi
     şartı; render öncesi verilen "tarandı, dizine eklenmedi" kararı onları
     görmüyor olabilir. Canlıda o kovada 4.405 sayfa var. (Bunun TEK sebep
     olduğu kanıtlanmış değil — Sol'un haklı uyarısı; korelasyon.)
  2. `robots.ts`'te izin verdiğimiz ALINTI crawler'ları JS ÇALIŞTIRMAZ. Kapıyı
     açıp metadata'yı saklamak kendi kendini bozan bir kurulum.

  Bedeli: bu kimliklere yanıt metadata çözülene kadar bloklar, TTFB artar.
  Büyüklüğü ÖLÇÜLMEDİ. Gerçek kullanıcılar listede değil.
*/
const htmlLimitedBots = new RegExp(
  [
    HTML_LIMITED_BOT_UA_RE.source,
    ...SEARCH_AND_CITATION_CRAWLERS,
    ...ADDITIONAL_HTML_LIMITED_CRAWLERS,
  ].join("|"),
  "i",
);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  poweredByHeader: false,
  reactStrictMode: true,
  htmlLimitedBots,
  /*
    GÖRSEL OPTİMİZASYONU KAPALI — 19 Eylül 2026.

    `next/image` bu depoda hiç kullanılmıyor (arama: tek eşleşme
    `src/middleware.ts`'teki `_next/image` matcher istisnası, bileşen değil).
    Buna rağmen Next optimizer rotasını varsayılan olarak açık tutuyor ve
    15.5.24 öncesinde AVIF işlerken kimliksiz uzaktan kod çalıştırma
    (kritik) uyarısı aldı. Sürüm zaten yükseltildi; bu satır ikinci kat.

    Ne kadar koruduğunu ABARTMAYALIM (Sol, 20 Eylül): rota tümden KALKMIYOR.
    Next isteği hâlâ tanıyor, optimizer modülünü ve cache sınıfını yüklüyor,
    sonra 404 veriyor (`next-server.js:227-254`). Bugünkü AVIF açığı için
    koruma etkili — `validateParams`, upstream fetch ve AVIF çözme yoluna hiç
    ulaşılmıyor. Ama "gelecekteki bütün optimizer açıkları bizi ilgilendirmez"
    demek ispatlanamaz; import/cache başlatma aşamasında bir açık çıkarsa bu
    ayar yetmez.

    Geri alma koşulu: `next/image` gerçekten kullanılacaksa bu satır kalkar ve
    `remotePatterns` bilinçli olarak tanımlanır. `unoptimized` görsellerin
    çalışmasını engellemez; yalnız sunucu tarafı yeniden boyutlandırmayı
    devre dışı bırakır.
  */
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
