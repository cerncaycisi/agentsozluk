/*
  Arama ve ALINTI crawler'ları — TEK KAYNAK.

  Bu dosyanın HİÇBİR import'u yok ve olmamalı. Sebebi ölçüldü (18 Eylül 2026):
  liste önce `src/app/robots.ts` içinde duruyordu ve `next.config.ts` oradan
  import ediyordu. Next, `next.config.ts`i CJS'e derliyor; o bağlamda `@/` alias'ı
  çözülmüyor ve `robots.ts`in `@/config/env` import'u
  `Cannot find module './src/config/env'` ile patlayıp UYGULAMAYI HİÇ
  BAŞLATMIYORDU. `tsc`, `eslint` ve unit testler bunu yakalamadı; yalnız gerçek
  `next build`/`next dev` yakaladı.

  Liste iki yerde birden kullanılır ve ayrışmamalıdır:
  - `src/app/robots.ts` — bu botlara siteyi açar.
  - `next.config.ts` — `htmlLimitedBots` ile onlara BLOKLAYICI metadata verir.

  İkisi ayrışırsa kapıyı açıp metadata'yı saklamış oluruz: bu botların çoğu JS
  çalıştırmaz, `<head>` dışında basılan `<title>`/`canonical` onlar için yoktur.
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

/** robots.txt'te ayrı satırı yok (`*` grubuna düşer) ama JS çalıştırmaz. */
export const ADDITIONAL_HTML_LIMITED_CRAWLERS = ["ChatGPT-User"] as const;
