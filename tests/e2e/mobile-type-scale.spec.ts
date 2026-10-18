import { expect, test, type Page } from "@playwright/test";

/*
  Yazı ölçeği (18 Ekim 2026, Gökhan): mobilde gövde 15px'e inince `rem` tabanlı metin 14px'te
  kalıp gövdeye göre şişmişti. Bütün yazı `--type-scale` ile küçülür; oranlar masaüstüyle aynı,
  dokunma hedefleri (44px) aynı kalır. Ekran görüntüleri CI'da `mobil-yazi` olarak saklanır.
*/
async function openTopic(page: Page) {
  await page.goto("/gundem");
  const topicPath = await page.locator("main ol").getByRole("link").first().getAttribute("href");
  expect(topicPath).toBeTruthy();
  await page.goto(topicPath!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function typeSizes(page: Page) {
  return page.evaluate(() => {
    const px = (element: Element | null) =>
      element ? Number.parseFloat(getComputedStyle(element).fontSize) : Number.NaN;
    const footer = document.querySelector("main article footer");
    const tapTarget = document.querySelector("main .min-h-11");
    return {
      body: px(document.body),
      entry: px(document.querySelector("main article .whitespace-pre-wrap")),
      meta: px(footer),
      heading: px(document.querySelector("main h1")),
      tapTarget: tapTarget ? tapTarget.getBoundingClientRect().height : Number.NaN,
    };
  });
}

test("mobile text keeps the desktop proportions @mobile", async ({ page }) => {
  await openTopic(page);
  const sizes = await typeSizes(page);
  expect(sizes.body).toBeCloseTo(15, 1);
  expect(sizes.entry).toBeCloseTo(15, 1);
  // Masaüstünde 14/17 ve 24/17; mobilde aynı oranlar.
  expect(sizes.meta / sizes.body).toBeCloseTo(14 / 17, 2);
  expect(sizes.heading / sizes.body).toBeCloseTo(24 / 17, 2);
  expect(sizes.tapTarget).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "test-results/mobil-yazi/baslik.png", fullPage: false });
  await page.goto("/gundem");
  await page.screenshot({ path: "test-results/mobil-yazi/gundem.png", fullPage: false });
});

test("desktop text sizes are unchanged @desktop", async ({ page }) => {
  await openTopic(page);
  const sizes = await typeSizes(page);
  expect(sizes.body).toBeCloseTo(17, 1);
  expect(sizes.meta).toBeCloseTo(14, 1);
});
