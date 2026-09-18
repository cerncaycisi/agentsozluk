import type { NextConfig } from "next";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";

/*
  STREAMING METADATA KAPATMASI — 18 Eylül 2026.

  Next 15.2'den beri `generateMetadata` sonucu varsayılan olarak STREAM edilir:
  `<title>`, `rel=canonical` ve `meta robots` `<head>` bittikten sonra, gövdenin
  içinde basılır. React onları istemcide `<head>`'e taşır.

  Ölçüm (canlı, Googlebot mobil kimliğiyle, 5 ayrı entry sayfası):
    </head> biter  : 3.556. bayt
    <title> başlar : ~34.800. bayt
    canonical      : ~35.200. bayt
  Beşinde de aynı. Başlık sayfalarında sorun yok (40/40 `<head>` içinde), sorun
  entry sayfalarında — canlıda 18.515 URL.

  Next'in varsayılan `htmlLimitedBots` listesi Bingbot'u İÇERİR, Googlebot'u
  İÇERMEZ (gerekçesi Google'ın JS render etmesi). Ölçüm bunu doğruladı: aynı
  sayfada Bingbot `<head>` içinde metadata görürken Googlebot görmüyordu.

  İki sebeple Googlebot'u ve alıntı crawler'larını listeye alıyoruz:

  1. Google'ın kendi şartı `rel=canonical` ve `meta robots`'un `<head>` içinde
     olması; render öncesi verilen "tarandı, dizine eklenmedi" kararı bunları
     hiç görmüyor. Canlıda o kovada 4.405 sayfa var.
  2. `robots.ts`'te izin verdiğimiz ALINTI crawler'ları (OAI-SearchBot,
     Claude-SearchBot, PerplexityBot…) JS ÇALIŞTIRMAZ. Onlara kapıyı açıp
     metadata'yı saklamak kendi kendini bozan bir kurulum. Aynı gün ölçülen GEO
     sonucu 18 sorguda 1 (`docs/GEO_ALINTI_OLCUMU_2026-09-18.md`).

  Bedeli: bu kimliklere yanıt, metadata çözülene kadar bloklar — TTFB artar.
  Kabul edilen bedel; bu botlar için doğruluk hızdan önce gelir. Gerçek
  kullanıcılar listede değil, onlarda streaming sürüyor.

  Liste `robots.ts` ile TEK KAYNAKTAN türetilir; ikisi ayrışırsa
  `tests/unit/indexing/robots-sitemap.test.ts` düşer.
*/
const htmlLimitedBots = new RegExp(
  [
    // Next 15.5 varsayılanı — korunuyor, yoksa Bing/Twitter/Slack gerilerdi.
    "Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot",
    "tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview",
    "applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot",
    "Discordbot|WhatsApp|SkypeUriPreview",
    // Bizim eklediklerimiz: arama + alıntı crawler'ları.
    "Googlebot|Google-Extended|OAI-SearchBot|ChatGPT-User|Claude-SearchBot",
    "Claude-User|PerplexityBot|Perplexity-User",
  ].join("|"),
  "i",
);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  poweredByHeader: false,
  reactStrictMode: true,
  htmlLimitedBots,
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
