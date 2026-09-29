import { expect, test } from "@playwright/test";

/*
  GA4 ölçüm sondası (29 Eylül 2026). GA4'e 23 Eylül'den beri olay düşmüyor.
  Soru: "Kabul et" diyen gerçek bir ziyaretçide GTM → Google etiketi → GA4
  `collect` zinciri çalışıyor mu? Olay geliyorsa sorun kod değil onay oranıdır;
  gelmiyorsa hangi halkada koptuğu aşağıdaki tanıdan okunur.

  Kapsam: yalnız herkese açık ana sayfa ve bir başlık listesi; hesap açmaz, giriş
  yapmaz, form göndermez. Aynı köke yalnız GET/HEAD geçer. Yalnız CSP'deki ölçüm
  kökenlerine GET/HEAD/POST geçer (gerçek bir GA4 oturumu oluşur); başka her istek
  engellenir ve yalnız kökeni + yolu kaydedilir.

  Tanı günlüğü yalnız izinli alanları taşır: host, yol, HTTP durumu, ölçüm kimliği,
  olay adı, CSP yönergesi ve engellenen kökeni, konsol mesaj SAYILARI, çerez ADLARI.
  Ham konsol metni, sorgu değeri, çerez değeri yazılmaz.
*/

const SITE = "https://agentsozluk.com";
const GA4_KIMLIGI = "G-TRGGP03ZLV";
const OLCUM_HOSTLARI = new Set([
  "www.googletagmanager.com",
  "www.google-analytics.com",
  "region1.google-analytics.com",
  "analytics.google.com",
  "stats.g.doubleclick.net",
]);
const olcumHostuMu = (host: string) =>
  OLCUM_HOSTLARI.has(host) || host.endsWith(".hotjar.com") || host.endsWith(".hotjar.io");
const collectMi = (url: URL) =>
  /(^|\.)google-analytics\.com$|^analytics\.google\.com$/u.test(url.hostname) &&
  url.pathname.endsWith("/g/collect");

interface CollectKaydi {
  host: string;
  yontem: string;
  durum: number | "FAILED" | "YANIT_YOK";
  tid: string | null;
  en: string | null;
}

/*
  CSP köprüsü sayfadaki her betiğe açıktır (Astra c87fd73): girdi güvenilmez
  sayılır. Yönerge sabit bir listeden, adres yalnız ayrıştırılmış http(s) kökeni
  ya da sabit anahtar sözcük olarak kaydedilir; başka her şey sabit etikettir.
*/
const CSP_YONERGELERI = new Set([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "child-src",
  "worker-src",
  "media-src",
  "manifest-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
]);
const CSP_ANAHTARLARI = new Set([
  "inline",
  "eval",
  "data",
  "blob",
  "wasm-eval",
  "trusted-types-sink",
]);

function cspKaydiSadelestir(yonerge: unknown, adres: unknown): string {
  const temizYonerge =
    typeof yonerge === "string" && CSP_YONERGELERI.has(yonerge) ? yonerge : "diger-yonerge";
  let temizAdres = "gecersiz-adres";
  if (typeof adres === "string" && adres.length <= 2048) {
    if (adres === "" || CSP_ANAHTARLARI.has(adres)) temizAdres = adres || "inline";
    else {
      try {
        const url = new URL(adres);
        if (url.protocol === "https:" || url.protocol === "http:") temizAdres = url.origin;
      } catch {
        // sabit etiket kalır
      }
    }
  }
  return `${temizYonerge} ${temizAdres}`;
}

test.use({ serviceWorkers: "block" });

test("kabul sonrası GA4 collect isteği başarıyla gider", async ({ context, page }) => {
  const istekler: string[] = [];
  const collectler: CollectKaydi[] = [];
  const engellenen: string[] = [];
  const cspIhlalleri: string[] = [];
  const konsolSayilari: Record<string, number> = {};

  await context.route("**/*", async (route) => {
    const istek = route.request();
    const url = new URL(istek.url());
    const yontem = istek.method();
    const ayniKok = url.origin === SITE && ["GET", "HEAD"].includes(yontem);
    const olcum =
      url.protocol === "https:" &&
      olcumHostuMu(url.hostname) &&
      ["GET", "HEAD", "POST"].includes(yontem);
    if (ayniKok || olcum) {
      await route.continue();
      return;
    }
    engellenen.push(`${yontem} ${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });
  // CSP ihlalleri belge dışında (test sürecinde) birikir: gezinmede kaybolmaz.
  await context.exposeFunction("__cspKaydet", (yonerge: unknown, engellenenAdres: unknown) => {
    if (cspIhlalleri.length < 50) cspIhlalleri.push(cspKaydiSadelestir(yonerge, engellenenAdres));
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (olay) => {
      const w = window as unknown as { __cspKaydet?: (a: string, b: string) => void };
      w.__cspKaydet?.(olay.violatedDirective, olay.blockedURI);
    });
  });
  page.on("console", (mesaj) => {
    konsolSayilari[mesaj.type()] = (konsolSayilari[mesaj.type()] ?? 0) + 1;
  });
  page.on("request", (istek) => {
    const url = new URL(istek.url());
    if (olcumHostuMu(url.hostname))
      istekler.push(`${istek.method()} ${url.hostname}${url.pathname}`);
  });
  const collectKaydet = (
    url: URL,
    yontem: string,
    govde: string | null,
    durum: CollectKaydi["durum"],
  ) => {
    if (!collectMi(url)) return;
    // tid sorguda ya da (toplu gönderimde) gövdede olabilir; gövdeden yalnız bizim kimliğin
    // varlığı okunur, başka değer alınmaz.
    const tid =
      url.searchParams.get("tid") ?? (govde?.includes(`tid=${GA4_KIMLIGI}`) ? GA4_KIMLIGI : null);
    collectler.push({ host: url.hostname, yontem, durum, tid, en: url.searchParams.get("en") });
  };
  page.on("requestfinished", async (istek) => {
    const yanit = await istek.response();
    collectKaydet(
      new URL(istek.url()),
      istek.method(),
      istek.postData(),
      yanit?.status() ?? "YANIT_YOK",
    );
  });
  page.on("requestfailed", (istek) => {
    collectKaydet(new URL(istek.url()), istek.method(), istek.postData(), "FAILED");
  });

  await page.goto("/");
  const serit = page.getByRole("region", { name: "Çerez tercihi" });
  await expect(serit).toBeVisible();
  const kabulAni = collectler.length;
  await serit.getByRole("button", { name: "Kabul et" }).click();

  const basarili = () =>
    collectler
      .slice(kabulAni)
      .filter(
        (kayit) =>
          kayit.tid === GA4_KIMLIGI &&
          typeof kayit.durum === "number" &&
          kayit.durum >= 200 &&
          kayit.durum < 300,
      );
  await expect
    .poll(() => basarili().length, { timeout: 30_000 })
    .toBeGreaterThan(0)
    .catch(() => undefined);

  const ilkBelge = await page.evaluate(() => ({
    gtmEtiketi: Boolean(document.getElementById("google-tag-manager")),
    hotjarEtiketi: Boolean(document.getElementById("hotjar-tracking")),
    gtmJs: [...document.scripts].some((s) => s.src.includes("/gtm.js")),
    gtagJs: [...document.scripts].some((s) => s.src.includes("/gtag/js")),
    dataLayerOlaylari: (
      (window as unknown as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []
    )
      .map((e) => (typeof e.event === "string" ? e.event.slice(0, 40) : "?"))
      .slice(0, 20),
    cerezAdlari: document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean),
  }));
  // Onaylı ikinci sayfa görüntülemesi (tam yükleme).
  await page.goto("/basliklar").catch(() => undefined);
  await page.waitForTimeout(8_000);

  const tani = { ilkBelge, istekler, collectler, engellenen, cspIhlalleri, konsolSayilari };
  process.stdout.write(`GA4_SONDA ${JSON.stringify(tani, null, 1)}\n`);
  expect(basarili().length, `${GA4_KIMLIGI} için 2xx collect olmalı`).toBeGreaterThan(0);
});
