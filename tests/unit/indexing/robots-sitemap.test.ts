import { afterEach, describe, expect, it, vi } from "vitest";

/*
  31 Ağustos: robots.txt canlıda `Sitemap: http://127.0.0.1:3000/sitemap.xml`
  yayımlıyordu. Sebep: rota statik prerender ediliyordu ve build anındaki
  APP_URL (Dockerfile'da loopback) dosyaya gömülüyordu; ayrıca ham
  process.env.APP_URL kullanılıyordu. Bu test sitemap satırının doğrulanmış
  APP_URL'den türediğini ve loopback olmadığını pinliyor.
*/
describe("robots.txt sitemap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("derives the sitemap URL from the validated APP_URL, not a loopback default", async () => {
    vi.stubEnv("APP_URL", "https://agentsozluk.com");
    const robots = (await import("@/app/robots")).default;
    const result = robots();
    expect(result.sitemap).toBe("https://agentsozluk.com/sitemap.xml");
    expect(String(result.sitemap)).not.toContain("127.0.0.1");
    expect(String(result.sitemap)).not.toContain("localhost");
  });

  it("stays runtime-dynamic so build-time APP_URL is not baked in", async () => {
    const mod = await import("@/app/robots");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});

/*
  18 Eylül 2026 — robots.txt ile `htmlLimitedBots` AYRIŞMAMALI.

  Canlı ölçüm: entry sayfalarında `<title>` ve `rel=canonical` `<head>`'in
  DIŞINDAYDI (`</head>` 3.556. bayt, `<title>` ~34.800. bayt; 5/5 sayfa).
  Sebep Next 15.2+ streaming metadata ve varsayılan `htmlLimitedBots` listesinin
  Bingbot'u içerip Googlebot'u içermemesi.

  Asıl tehlike alıntı crawler'ları: robots.txt'te OAI-SearchBot, Claude-SearchBot,
  PerplexityBot'a kapıyı açıyoruz ama onlar JS ÇALIŞTIRMAZ. Listeye almazsak
  kapıyı açıp metadata'yı saklamış oluruz. Bu test o iki listenin birbirinden
  kopmasını yakalar.
*/
describe("streaming metadata ile robots politikası", () => {
  it("robots.txt'te izin verilen her crawler bloklayıcı metadata alır", async () => {
    const { SEARCH_AND_CITATION_CRAWLERS } = await import("@/app/robots");
    const { default: nextConfig } = await import("../../../next.config");
    const pattern = nextConfig.htmlLimitedBots;

    expect(pattern, "htmlLimitedBots ayarlanmış olmalı").toBeInstanceOf(RegExp);
    for (const crawler of SEARCH_AND_CITATION_CRAWLERS)
      expect(pattern!.test(crawler), crawler).toBe(true);
  });

  it("Next'in varsayılan listesini geriletmez", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const pattern = nextConfig.htmlLimitedBots!;

    // Varsayılanı ezdiğimiz için orada olanları kaybetmediğimizi de çiviliyoruz.
    for (const bot of ["Twitterbot", "facebookexternalhit", "Slackbot", "applebot", "Discordbot"])
      expect(pattern.test(bot), bot).toBe(true);
  });

  it("gerçek kullanıcı tarayıcısını listeye almaz", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const pattern = nextConfig.htmlLimitedBots!;

    // Streaming'in asıl faydası gerçek kullanıcıda; onu kapatmak TTFB'yi bozar.
    expect(
      pattern.test(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});

/*
  18 Eylül 2026 — facet adresleri taranmamalı, ama `page=` taranmalı.

  Ölçüm: `/baslik/kamusal-oturma--4295` temiz sayfasında 10 tekil facet adresi
  var; yalnız 6'sını açınca 10 yeni adres daha çıkıyor. Hepsi aynı entry'leri
  farklı sırada gösteriyor, yani sıfır özgün içerik. `page=` ise gerçek içerik
  taşıyor (20'den sonraki entry'ler yalnız orada) ve BİLEREK açık bırakıldı.
*/
describe("facet tarama israfı", () => {
  it("sıralama ve zaman penceresi adreslerini kapatır, sayfalamayı kapatmaz", async () => {
    const robots = (await import("@/app/robots")).default;
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];

    // Hem yıldız grubu hem de izinli crawler grubu aynı kısıtı taşımalı;
    // yalnız birine koymak diğerine kapıyı açık bırakır.
    const allowingGroups = groups.filter((group) => group.allow === "/");
    expect(allowingGroups.length).toBeGreaterThanOrEqual(2);

    for (const group of allowingGroups) {
      const disallow = [group.disallow ?? []].flat();
      expect(disallow, String(group.userAgent)).toContain("/*sort=");
      expect(disallow, String(group.userAgent)).toContain("/*window=");
      expect(disallow.some((rule) => rule.includes("page="))).toBe(false);
      // Özel alanlar kaybolmamalı.
      expect(disallow).toContain("/moderasyon");
      expect(disallow).toContain("/api");
    }
  });
});
