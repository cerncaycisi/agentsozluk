import { expect, test, type Page } from "@playwright/test";

/*
  Üretimde çerez onayı kabulü (Astra şartı, PR #156). Salt okunur: hesap açmaz,
  giriş yapmaz, form göndermez. Üçüncü taraf ölçüm istekleri engellenir ve sayılır.
*/

const IZLEME =
  /https:\/\/[^/]*(googletagmanager|google-analytics|analytics\.google|doubleclick|hotjar)\./u;

function izlemeyiYakala(page: Page) {
  const istekler: string[] = [];
  return page
    .route(IZLEME, async (route) => {
      istekler.push(route.request().url());
      await route.abort("blockedbyclient");
    })
    .then(() => istekler);
}

const serit = (page: Page) => page.getByRole("region", { name: "Çerez tercihi" });

test("onaysız ve ret sonrası izleme yok; kabulde GTM; Hotjar hiç yok; hassas geçiş tam yükleme", async ({
  page,
}) => {
  const istekler = await izlemeyiYakala(page);

  // 1) CSP: tek başlık, Hotjar yok.
  const yanit = await page.goto("/");
  expect(yanit?.status()).toBe(200);
  const csp = (await yanit?.allHeaders())?.["content-security-policy"] ?? "";
  expect(csp).toContain("https://www.googletagmanager.com");
  expect(csp).not.toMatch(/hotjar/iu);

  // 2) Karar öncesi: şerit var, izleme isteği yok, noscript iframe yok.
  await expect(serit(page)).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(istekler).toEqual([]);
  await expect(page.locator("iframe[src*='googletagmanager']")).toHaveCount(0);

  // 3) Reddet: şerit kapanır, sonraki sayfada da yok, izleme yok. Künye görünür.
  await serit(page).getByRole("button", { name: "Reddet" }).click();
  await expect(serit(page)).toHaveCount(0);
  await page.goto("/hakkinda");
  await expect(page.getByRole("heading", { level: 2, name: "Künye ve iletişim" })).toBeVisible();
  await expect(page.getByText(/“Agent Sözlük” takma adıyla işletilen/u)).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(serit(page)).toHaveCount(0);
  expect(istekler).toEqual([]);

  // 4) Gizlilik sayfasından sıfırla: sayfa yenilenir, şerit geri gelir.
  await page.goto("/gizlilik");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Çerez tercihimi sıfırla" }).click(),
  ]);
  await expect(serit(page)).toBeVisible();
  expect(istekler).toEqual([]);

  // 5) Kabul et: GTM yüklenmeye çalışır (engellenir), Hotjar yok.
  await page.goto("/");
  await serit(page).getByRole("button", { name: "Kabul et" }).click();
  await expect
    .poll(() => istekler.filter((u) => u.includes("googletagmanager.com/gtm.js")).length)
    .toBeGreaterThan(0);
  expect(istekler.some((u) => /hotjar/iu.test(u))).toBe(false);

  // 6) GTM yüklü belgeden /giris'e geçiş TAM sayfa yüklemesidir; orada GTM yok.
  await page.evaluate(() => {
    (window as unknown as { __ayniBelge?: boolean }).__ayniBelge = true;
  });
  const oncekiSayi = istekler.length;
  const girisBaglantisi = page.locator('a[href^="/giris"]').first();
  await Promise.all([page.waitForURL(/\/giris/u), girisBaglantisi.click()]);
  await page.waitForLoadState("load");
  const ayniBelge = await page.evaluate(
    () => (window as unknown as { __ayniBelge?: boolean }).__ayniBelge === true,
  );
  expect(ayniBelge).toBe(false);
  await page.waitForTimeout(1_500);
  expect(istekler.length).toBe(oncekiSayi);
  await expect(serit(page)).toHaveCount(0);
});

test("Do Not Track / GPC bildiren tarayıcıda şerit ve izleme yok", async ({ browser }) => {
  const baglam = await browser.newContext({ extraHTTPHeaders: { DNT: "1", "Sec-GPC": "1" } });
  const page = await baglam.newPage();
  const istekler = await izlemeyiYakala(page);
  await page.goto("/");
  await page.waitForTimeout(2_000);
  await expect(serit(page)).toHaveCount(0);
  expect(istekler).toEqual([]);
  await baglam.close();
});
