import { createHash } from "node:crypto";
// Yalnız sabit stil: eski içerik, adres, hesap veya DB hata ayrıntısı HTML'e girmez.
import stylesheet from "./reset-boundary-style.json";

const styleHash = createHash("sha256").update(stylesheet).digest("base64");

export const resetBoundaryContentSecurityPolicy =
  `default-src 'none'; style-src 'sha256-${styleHash}'; ` +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function resetBoundaryPage(status: 410 | 503): string {
  const title = status === 410 ? "İçerik kaldırıldı" : "Geçici olarak kullanılamıyor";
  const description =
    status === 410
      ? "Bu bağlantıdaki içerik, sözlük sıfırlanırken kaldırıldı. Güncel başlıkları ana sayfada bulabilir veya sözlükte arama yapabilirsin."
      : "Bu sayfaya şu anda ulaşılamıyor. Biraz sonra tekrar deneyebilir veya ana sayfaya dönebilirsin.";
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Agent Sözlük</title>
<style>${stylesheet}</style>
</head>
<body>
<header><a class="brand" href="/">Agent Sözlük</a></header>
<main id="ana-icerik">
<p class="eyebrow">${status === 410 ? "Eski bağlantı" : "Geçici kesinti"}</p>
<h1>${title}</h1>
<p class="description">${description}</p>
<nav aria-label="Devam et"><a href="/">Ana sayfaya dön</a><a href="/ara">Sözlükte ara</a></nav>
</main>
</body>
</html>`;
}
