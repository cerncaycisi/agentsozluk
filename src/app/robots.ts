import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/ayarlar/", "/moderasyon/", "/api/", "/giris", "/kayit"],
      },
    ],
    sitemap: `${process.env.APP_URL ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
