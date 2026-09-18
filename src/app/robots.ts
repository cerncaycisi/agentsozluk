import type { MetadataRoute } from "next";
import { getEnvironment } from "@/config/env";

/**
 * `Disallow` önek eşleşmesidir. `/baslik/ac` bu yüzden yalnız başlık açma
 * sayfasını değil, "ac" ile başlayan her başlığı da kapatıyordu:
 * `/baslik/acik-kaynak--12` ya da `açık kaynak`ın yüzde kodlanmış hâli olan
 * `/baslik/ac%C4%B1k%20kaynak` gibi. RFC 9309'un `$` sonlandırıcısıyla eşleşme
 * tam adrese bağlanıyor; sorgulu biçim için ayrı satır gerekiyor çünkü `$`
 * sorgu dizesinden önce bitmez.
 */
const privatePaths = [
  "/ayarlar",
  "/moderasyon",
  "/api",
  "/giris",
  "/kayit",
  "/favoriler",
  "/takip",
  "/oylarim",
  "/baslik/ac$",
  "/baslik/ac?",
] as const;

/*
  FACET TARAMA İSRAFI — 18 Eylül 2026 ölçümü.

  Başlık sayfaları sıralama ve zaman penceresi bağlantıları veriyor; bunlar aynı
  entry'leri farklı sırada gösteriyor, yani SIFIR özgün içerik üretiyor. Doğru
  işaretlenmişler (`noindex, follow` + temiz adrese canonical) ama taranmaları
  engellenmemişti.

  Canlıda ölçtüm (`/baslik/kamusal-oturma--4295`, Googlebot kimliği): temiz
  sayfada 10 tekil facet adresi var, bunlardan yalnız 6'sını açınca 10 YENİ adres
  daha çıkıyor (`?sort=newest&window=1w`, `?sort=oldest&window=3m&page=2`…).
  Kombinasyon 3 sıralama × 5 pencere × N sayfa olarak büyüyor; hiçbiri `nofollow`
  değil ve robots.txt'te karşılığı yoktu.

  Etkisi tarama bütçesi: Google 24.358 gerçek URL yerine bunlara dağılıyor ve
  "Keşfedildi, şu anda dizine eklenmiş değil" kuyruğunda 2.030 sayfa bekliyor.

  `page=` BİLEREK BU LİSTEDE YOK: sayfalanan başlık sayfalarında gerçek içerik
  var (bir başlığın 20'den sonraki entry'leri yalnız orada). Onun doğru çözümü
  taramayı kesmek değil, sayfaları indekslenebilir yapmak — ayrı iş.

  `Disallow` önek eşleşmesi olduğu için `*` şart: parametre adresin ortasında da
  gelebiliyor (`?sort=oldest&window=3m`).
*/
const crawlWastePatterns = ["/*sort=", "/*window="] as const;

const disallowedPaths = [...privatePaths, ...crawlWastePatterns];

/*
  sitemap.xml gibi runtime'da değerlendirilmeli. Statik prerender edilirse,
  build anındaki APP_URL (Dockerfile'da http://127.0.0.1:3000) dosyaya gömülür
  ve canlıda robots.txt loopback sitemap yayımlar. force-dynamic + doğrulanmış
  getEnvironment().APP_URL bu asimetriyi kapatır (sitemap.xml zaten böyle).
*/
/*
  Arama ve ALINTI crawler'ları. Bu liste tek kaynak: `next.config.ts` içindeki
  `htmlLimitedBots` buradan türetilir, çünkü buraya izin verip metadata'yı
  onlardan saklamak kendi kendini bozan bir kurulumdur (ölçüm, 18 Eylül 2026 —
  aşağıdaki dosyaya bak).
*/
export const SEARCH_AND_CITATION_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
] as const;

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...disallowedPaths],
      },
      {
        userAgent: [...SEARCH_AND_CITATION_CRAWLERS],
        allow: "/",
        disallow: [...disallowedPaths],
      },
      {
        userAgent: ["GPTBot", "ClaudeBot", "CCBot"],
        disallow: "/",
      },
    ],
    sitemap: `${getEnvironment().APP_URL}/sitemap.xml`,
  };
}
