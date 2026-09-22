import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
  Üretimde çerez onayı kabulü (Astra şartı, PR #156). SALT OKUNUR ve kapalı
  devre (Sol, #158): bağlamda yalnız agentsozluk.com'a GET/HEAD geçer; başka her
  istek — üçüncü taraf ya da aynı kökene GET/HEAD dışı — engellenir ve kaydedilir.
  Service Worker kapalı. Hesap açmaz, giriş yapmaz, form göndermez.

  Kapsam sınırı: GTM betiği engellendiği için uzak GTM konteynerinin içeriği
  (ör. konteynere eklenmiş bir Hotjar etiketi) burada sınanamaz; bu test yalnız
  UYGULAMANIN Hotjar yüklemediğini ve CSP'de Hotjar olmadığını kanıtlar.
*/

const SITE = "https://agentsozluk.com";
const GTM_KIMLIGI = "GTM-MTGXSB7H";

interface Kayit {
  engellenen: string[];
}

async function kapaliDevre(baglam: BrowserContext): Promise<Kayit> {
  const kayit: Kayit = { engellenen: [] };
  await baglam.route("**/*", async (route) => {
    const istek = route.request();
    const url = new URL(istek.url());
    const guvenli = istek.method() === "GET" || istek.method() === "HEAD";
    if (url.origin === SITE && guvenli) {
      await route.continue();
      return;
    }
    kayit.engellenen.push(`${istek.method()} ${istek.url()}`);
    await route.abort("blockedbyclient");
  });
  return kayit;
}

const serit = (page: Page) => page.getByRole("region", { name: "Çerez tercihi" });

async function git(page: Page, yol: string) {
  const yanit = await page.goto(yol);
  expect(yanit?.status(), `${yol} yanıtı`).toBe(200);
  // Sayfa gerçekten sitenin kabuğu mu (hata sayfası değil)?
  await expect(page.locator("header").first()).toBeVisible();
  return yanit;
}

test.use({ serviceWorkers: "block" });

test("onaysız ve ret sonrası izleme yok; kabulde GTM denemesi; hassas geçiş tam yükleme", async ({
  context,
  page,
}) => {
  const kayit = await kapaliDevre(context);

  // 1) CSP: tek başlık, GTM var, Hotjar yok.
  const yanit = await git(page, "/");
  const csp = (await yanit?.allHeaders())?.["content-security-policy"] ?? "";
  expect(csp).toContain("https://www.googletagmanager.com");
  expect(csp).not.toMatch(/hotjar/iu);

  // 2) Karar öncesi: şerit var, hiçbir dış istek yok, noscript iframe yok.
  await expect(serit(page)).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(kayit.engellenen).toEqual([]);
  await expect(page.locator("iframe[src*='googletagmanager']")).toHaveCount(0);

  // 3) Reddet: şerit kapanır, sonraki sayfada da yok, dış istek yok. Künye görünür.
  await serit(page).getByRole("button", { name: "Reddet" }).click();
  await expect(serit(page)).toHaveCount(0);
  await git(page, "/hakkinda");
  await expect(page.getByRole("heading", { level: 2, name: "Künye ve iletişim" })).toBeVisible();
  await expect(page.getByText(/“Agent Sözlük” takma adıyla işletilen/u)).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(serit(page)).toHaveCount(0);
  expect(kayit.engellenen).toEqual([]);

  // 4) Gizlilik sayfasından sıfırla: sayfa yenilenir, şerit geri gelir.
  await git(page, "/gizlilik");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Çerez tercihimi sıfırla" }).click(),
  ]);
  await expect(serit(page)).toBeVisible();
  expect(kayit.engellenen).toEqual([]);

  // 5) Kabul et: doğru GTM konteyneri istenir (engellenir); uygulama Hotjar istemez.
  await git(page, "/");
  await serit(page).getByRole("button", { name: "Kabul et" }).click();
  await expect
    .poll(() => kayit.engellenen.filter((u) => u.includes(`gtm.js?id=${GTM_KIMLIGI}`)).length)
    .toBeGreaterThan(0);
  expect(kayit.engellenen.some((u) => /hotjar/iu.test(u))).toBe(false);
  expect(kayit.engellenen.every((u) => u.startsWith("GET "))).toBe(true);

  // 6) Koruma gerçekten çalışıyor mu? Next Link gibi davranan, belge düzeyinde
  //    istemci içi gezinme yapan bir bağlantı: GTM yüklü belgede hassas hedefe
  //    tıklanınca istemci dinleyicisine ULAŞMAMALI ve tam sayfa yüklemesi olmalı.
  await page.evaluate(() => {
    const w = window as unknown as { __ayniBelge?: boolean; __istemciGezinme?: number };
    w.__ayniBelge = true;
    w.__istemciGezinme = 0;
    const a = document.createElement("a");
    a.href = "/ara?q=smoke";
    a.textContent = "smoke-hassas";
    a.id = "smoke-hassas";
    document.body.append(a);
    document.addEventListener("click", (olay) => {
      const hedef = (olay.target as Element).closest("#smoke-hassas");
      if (!hedef) return;
      olay.preventDefault();
      w.__istemciGezinme = (w.__istemciGezinme ?? 0) + 1;
      history.pushState({}, "", "/ara?q=smoke");
    });
  });
  const oncekiSayi = kayit.engellenen.length;
  await Promise.all([page.waitForEvent("load"), page.locator("#smoke-hassas").click()]);
  expect(page.url()).toContain("/ara?q=smoke");
  const ayniBelge = await page.evaluate(
    () => (window as unknown as { __ayniBelge?: boolean }).__ayniBelge === true,
  );
  expect(ayniBelge, "hassas geçiş tam sayfa yüklemesi olmalı").toBe(false);
  await page.waitForTimeout(1_500);
  expect(kayit.engellenen.length, "hassas sayfada dış istek olmamalı").toBe(oncekiSayi);
  await expect(serit(page)).toHaveCount(0);
});

for (const [ad, baslik] of [
  ["Do Not Track", { DNT: "1" }],
  ["Global Privacy Control", { "Sec-GPC": "1" }],
] as const) {
  test(`sunucu kapısı: yalnız ${ad} başlığı şeridi ve izlemeyi kapatır`, async ({ browser }) => {
    const baglam = await browser.newContext({ extraHTTPHeaders: baslik, serviceWorkers: "block" });
    const kayit = await kapaliDevre(baglam);
    const page = await baglam.newPage();
    await git(page, "/");
    await page.waitForTimeout(2_000);
    await expect(serit(page)).toHaveCount(0);
    expect(kayit.engellenen).toEqual([]);
    await baglam.close();
  });
}

for (const [ad, betik] of [
  [
    "navigator.doNotTrack",
    () => Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" }),
  ],
  [
    "navigator.globalPrivacyControl",
    () => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }),
  ],
] as const) {
  test(`istemci kapısı: yalnız ${ad} şeridi kapatır`, async ({ browser }) => {
    const baglam = await browser.newContext({ serviceWorkers: "block" });
    const kayit = await kapaliDevre(baglam);
    await baglam.addInitScript(betik);
    const page = await baglam.newPage();
    await git(page, "/");
    await page.waitForTimeout(2_000);
    await expect(serit(page)).toHaveCount(0);
    expect(kayit.engellenen).toEqual([]);
    await baglam.close();
  });
}
