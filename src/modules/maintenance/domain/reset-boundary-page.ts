import { createHash } from "node:crypto";

// Yalnız sabit stil: eski içerik, adres, hesap veya DB hata ayrıntısı HTML'e girmez.
const stylesheet = `
:root{color-scheme:light;--page:#f5f3ec;--ink:#2b2f36;--muted:#656c7a;--primary:#9e432d;--border:#e0ddd6}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:1rem/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{max-width:72rem;margin:auto;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border)}
a{color:var(--primary);text-underline-offset:.25em}
.brand{font-size:1.15rem;font-weight:700;text-decoration:none}
main{max-width:40rem;margin:auto;padding:clamp(4rem,12vh,8rem) 1.5rem}
.eyebrow{margin:0;color:var(--muted);font-size:.8rem;letter-spacing:.12em;text-transform:uppercase}
h1{margin:.75rem 0 1rem;font-size:clamp(2rem,6vw,3rem);line-height:1.15;letter-spacing:-.035em}
.description{max-width:36rem;color:var(--muted)}
nav{display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin-top:2rem}
nav a{font-weight:600}
a:focus-visible{outline:3px solid var(--primary);outline-offset:5px;border-radius:2px}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--page:#1f2227;--ink:#eeeae2;--muted:#b2b6bf;--primary:#eaa18b;--border:#45494f}}
`;

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
