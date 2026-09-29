import { expect, test, type Request } from "@playwright/test";

/*
  GA4 ölçüm sondası (29 Eylül 2026). GA4'e 23 Eylül'den beri olay düşmüyor.
  Soru: "Kabul et" diyen gerçek bir ziyaretçide GTM → Google etiketi → GA4
  `collect` zinciri çalışıyor mu? Olay geliyorsa sorun kod değil onay oranıdır;
  gelmiyorsa hangi halkada koptuğu aşağıdaki tanıdan okunur.

  Kapsam: yalnız herkese açık ana sayfa ve bir başlık listesi; hesap açmaz, giriş
  yapmaz, form göndermez; gerçek bir GA4 oturumu oluşur. İstek yakalanmaz (gözlem
  kipi, aşağıda): ölçüm dışı üçüncü taraf ya da aynı köke GET/HEAD dışı istek
  gözlenirse yalnız kökeni + yolu kaydedilir ve test düşer.

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
  hata: string | null;
  tid: string | null;
  en: string | null;
  kabulSonrasi: boolean;
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

/*
  Sayfa kaynaklı değerler (dataLayer olayları, collect parametreleri) de güvenilmez
  sayılır (Astra b818e1e): yalnız bilinen adlar ve biçimi doğrulanmış ölçüm kimliği
  günlüğe girer; gerisi sabit etikettir.
*/
const BILINEN_OLAYLAR = new Set([
  "gtm.js",
  "gtm.init",
  "gtm.init_consent",
  "gtm.dom",
  "gtm.load",
  "gtm.historyChange",
  "gtm.historyChange-v2",
  "gtm.scrollDepth",
  "gtm.click",
  "gtm.linkClick",
  "gtm.timer",
  "gtm.visibility",
  "page_view",
  "user_engagement",
  "scroll",
  "first_visit",
  "session_start",
  "click",
]);
const olayAdi = (deger: unknown) =>
  typeof deger === "string" && BILINEN_OLAYLAR.has(deger) ? deger : "diger-olay";
const olcumKimligi = (deger: string | null) =>
  deger === null ? null : /^G-[A-Z0-9]{4,12}$/u.test(deger) ? deger : "gecersiz-kimlik";

/** Toplu gönderim gövdesi satır başına bir parametre kümesidir; `tid` tam eşitlikle okunur. */
function govdedekiKimlik(govde: string | null): string | null {
  if (!govde) return null;
  for (const satir of govde.split(/\r?\n/u)) {
    const tid = new URLSearchParams(satir).get("tid");
    if (tid) return tid;
  }
  return null;
}

test.use({ serviceWorkers: "block" });

test("kabul sonrası GA4 collect isteği başarıyla gider", async ({ context, page }) => {
  const istekler: string[] = [];
  const beklenmeyen: string[] = [];
  const cspIhlalleri: string[] = [];
  const konsolSayilari: Record<string, number> = {};

  /*
    Gözlem kipi (29 Eylül, ilk koşu `36635691698`): istek YAKALANMAZ. İlk koşuda
    `context.route` açıkken üç collect POST'u da ağ seviyesinde düştü; Chromium
    keepalive/beacon isteklerini DevTools yakalaması altında düşürebildiği için bu
    sondanın kendi yan etkisi olabilir. Artık tarayıcı gerçek bir ziyaretçi gibi davranır;
    hangi kökenlere gidilebileceğini sitenin kendi CSP'si belirler. Test yalnız GET
    gezinmesi ve tek bir "Kabul et" tıklaması yapar; ölçüm dışı üçüncü taraf ve aynı köke
    GET/HEAD dışı istek gözlenirse tanıya yazılır ve test düşer.
  */
  page.on("request", (istek) => {
    const url = new URL(istek.url());
    const ayniKokGuvenli = url.origin === SITE && ["GET", "HEAD"].includes(istek.method());
    if (!ayniKokGuvenli && !olcumHostuMu(url.hostname) && url.protocol.startsWith("http"))
      beklenmeyen.push(`${istek.method()} ${url.origin}${url.pathname}`);
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
  /*
    Kabul anı gerçek tıklamanın kendisidir (Astra 6ba18b3 P3): düğmedeki yakalama
    dinleyicisi tarayıcı saatini (epoch ms) tahmin edilemez adlı bir kapanışta tutar.
    Her ölçüm isteğinin başlangıç zamanı (`timing().startTime`, aynı saat) bu anla
    karşılaştırılır. Kabulden önce başlayan ölçüm isteği onay kapısının bozuk olduğu
    anlamına gelir ve testi düşürür.
  */
  let kabulAni: number | null = null;
  /*
    Olaylar ham biriktirilir, sınıflandırma kabul anı kesinleştikten SONRA yapılır
    (Astra 35a5dde): aktarım yarışı sınıfı değiştiremez. Başlangıç zamanı yanıtlı
    isteklerde `timing().startTime` (epoch ms); yanıtsız başarısız istekte 0 kalabildiği
    için o durumda Node'un `request` olayını gördüğü an (aynı makine saati, başlangıçtan
    sonra) kullanılır.
  */
  const gorulmeAni = new WeakMap<Request, number>();
  page.on("request", (istek) => gorulmeAni.set(istek, Date.now()));
  const hamOlaylar: { istek: Request; durum: CollectKaydi["durum"]; hata: string | null }[] = [];
  page.on("requestfinished", async (istek) => {
    const yanit = await istek.response();
    hamOlaylar.push({ istek, durum: yanit?.status() ?? "YANIT_YOK", hata: null });
  });
  // Hata metni yalnız `net::ERR_…` biçimindeyse yazılır (sabit Chromium sözlüğü).
  page.on("requestfailed", (istek) => {
    const metin = istek.failure()?.errorText ?? "";
    hamOlaylar.push({
      istek,
      durum: "FAILED",
      hata: /^net::ERR_[A-Z_]{1,60}$/u.test(metin) ? metin : "diger-hata",
    });
  });
  const baslangic = (istek: Request) => {
    const zaman = istek.timing().startTime;
    return zaman > 0 ? zaman : (gorulmeAni.get(istek) ?? Number.POSITIVE_INFINITY);
  };
  const siniflandir = () => {
    const collectler: CollectKaydi[] = [];
    const kabulOncesiOlcum: string[] = [];
    for (const { istek, durum, hata } of hamOlaylar) {
      const url = new URL(istek.url());
      if (!olcumHostuMu(url.hostname)) continue;
      const sonra = kabulAni !== null && baslangic(istek) >= kabulAni;
      if (!sonra) kabulOncesiOlcum.push(`${url.hostname}${url.pathname}`);
      if (!collectMi(url)) continue;
      collectler.push({
        host: url.hostname,
        yontem: istek.method(),
        durum,
        hata,
        tid: olcumKimligi(url.searchParams.get("tid") ?? govdedekiKimlik(istek.postData())),
        en: url.searchParams.has("en") ? olayAdi(url.searchParams.get("en")) : null,
        kabulSonrasi: sonra,
      });
    }
    return { collectler, kabulOncesiOlcum };
  };

  await page.goto("/");
  const serit = page.getByRole("region", { name: "Çerez tercihi" });
  await expect(serit).toBeVisible();
  const okuyucu = `__kabul_${Math.random().toString(36).slice(2)}`;
  await page.evaluate((ad) => {
    let an: number | null = null;
    const dugme = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Kabul et",
    );
    dugme?.addEventListener("click", () => (an ??= performance.timeOrigin + performance.now()), {
      capture: true,
    });
    Object.defineProperty(window, ad, { value: () => an });
  }, okuyucu);
  await serit.getByRole("button", { name: "Kabul et" }).click();
  kabulAni = await page.evaluate(
    (ad) => (window as unknown as Record<string, () => number | null>)[ad]?.() ?? null,
    okuyucu,
  );
  expect(kabulAni, "kabul tıklaması yakalanmalı").not.toBeNull();

  const basarili = () =>
    siniflandir().collectler.filter(
      (kayit) =>
        kayit.kabulSonrasi &&
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
      .map((e) => e.event)
      .slice(0, 20),
    cerezAdlari: document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean),
  }));
  // Onaylı ikinci sayfa görüntülemesi (tam yükleme).
  await page.goto("/basliklar").catch(() => undefined);
  await page.waitForTimeout(8_000);

  const { collectler, kabulOncesiOlcum } = siniflandir();
  const tani = {
    ilkBelge: { ...ilkBelge, dataLayerOlaylari: ilkBelge.dataLayerOlaylari.map(olayAdi) },
    istekler,
    kabulOncesiOlcum,
    collectler,
    beklenmeyen,
    cspIhlalleri,
    konsolSayilari,
  };
  process.stdout.write(`GA4_SONDA ${JSON.stringify(tani, null, 1)}\n`);
  expect(beklenmeyen, "ölçüm dışı üçüncü taraf ya da yazma isteği olmamalı").toEqual([]);
  expect(kabulOncesiOlcum, "kabulden önce ölçüm isteği olmamalı").toEqual([]);
  expect(basarili().length, `${GA4_KIMLIGI} için 2xx collect olmalı`).toBeGreaterThan(0);
});
