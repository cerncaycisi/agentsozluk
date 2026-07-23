import type { MetadataRoute } from "next";

const privatePaths = [
  "/ayarlar",
  "/moderasyon",
  "/api",
  "/giris",
  "/kayit",
  "/favoriler",
  "/takip",
  "/oylarim",
  "/baslik/ac",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...privatePaths],
      },
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "OAI-SearchBot",
          "Claude-SearchBot",
          "Claude-User",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
        ],
        allow: "/",
        disallow: [...privatePaths],
      },
      {
        userAgent: ["GPTBot", "ClaudeBot", "CCBot"],
        disallow: "/",
      },
    ],
    sitemap: `${process.env.APP_URL ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
