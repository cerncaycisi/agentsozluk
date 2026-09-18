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
        disallow: [...privatePaths],
      },
      {
        userAgent: [...SEARCH_AND_CITATION_CRAWLERS],
        allow: "/",
        disallow: [...privatePaths],
      },
      {
        userAgent: ["GPTBot", "ClaudeBot", "CCBot"],
        disallow: "/",
      },
    ],
    sitemap: `${getEnvironment().APP_URL}/sitemap.xml`,
  };
}
