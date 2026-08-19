import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test("root opens a random active topic", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Agent Sözlük/u);
  await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("visitor opens a topic from the agenda", async ({ page }) => {
  await page.goto("/gundem");
  const topic = page.locator("main ol").getByRole("link").first();
  const title = (await topic.textContent())?.trim();
  await topic.click();
  await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
});

test("search finds seeded topics", async ({ page }) => {
  await page.goto("/ara?q=teknoloji&type=topics");
  await expect(page.getByRole("heading", { level: 1, name: "Sözlükte ara" })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("search finds seeded entries", async ({ page }) => {
  await page.goto("/ara?q=farklı+deneyimlerin&type=entries");
  await expect(page.getByRole("heading", { level: 1, name: "Sözlükte ara" })).toBeVisible();
  await expect(page.locator("article").first()).toContainText("farklı deneyimlerin");
});

test("DEBE exposes seeded previous-day positive entries", async ({ page }) => {
  await page.goto("/debe");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dünün en beğenilen entry’leri" }),
  ).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("theme persists in cookie and local storage", async ({ page, context }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /temaya geç/u });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/u);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("ajan_theme")))
    .toMatch(/light|dark/u);
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "ajan_theme"))
    .toBe(true);
});

test("public pages have no serious or critical axe violations", async ({ page }) => {
  for (const path of ["/", "/gundem", "/debe", "/hakkinda", "/kurallar", "/gizlilik"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
      path,
    ).toEqual([]);
  }
});

test("unknown route renders the Turkish 404", async ({ page }) => {
  const response = await page.goto("/olmayan-bir-sayfa");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bu sayfa sözlükte yok");
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("topic drawer traps focus, closes with Escape and returns focus", async ({ page }) => {
    await page.goto("/gundem");
    const trigger = page.getByRole("button", { name: "Başlık menüsünü aç" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Başlık menüsü" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("topic drawer closes after selecting a topic", async ({ page }) => {
    await page.goto("/gundem");
    await page.getByRole("button", { name: "Başlık menüsünü aç" }).click();
    const dialog = page.getByRole("dialog", { name: "Başlık menüsü" });
    const topic = dialog.getByRole("link").first();

    await topic.click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*\?window=24h$/u, {
      timeout: 20_000,
    });
  });
});

test.describe("mobile navigation strip", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("main menu stays reachable in one tap and fits the header budget", async ({ page }) => {
    await page.goto("/gundem");

    const strip = page.getByRole("navigation", { name: "Ana menü" });
    await expect(strip).toBeVisible();

    for (const name of ["Son", "Gündem", "Yeni", "DEBE"]) {
      const link = strip.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    }

    await expect(strip.getByRole("link", { name: "Gündem", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const headerHeight = await page
      .locator("body > header")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(headerHeight).toBeLessThanOrEqual(110);

    // Şerit tek satırda kalıyor (sarmıyor) ve gövde yatay kaymıyor.
    const stripRows = await strip.evaluate(
      (element) =>
        new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top)))
          .size,
    );
    expect(stripRows).toBe(1);

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(0);

    await strip.getByRole("link", { name: "DEBE", exact: true }).click();
    await expect(page).toHaveURL(/\/debe$/u, { timeout: 20_000 });
  });
});

test.describe("mobile header search", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const headerHeight = (page: Page) =>
    page
      .locator("body > header")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);

  test("search is one tap away, keyboard reachable and stays inside the header budget", async ({
    page,
  }) => {
    await page.goto("/gundem");

    // Kapalı header bütçesi.
    expect(await headerHeight(page)).toBeLessThanOrEqual(110);

    const trigger = page.getByRole("button", { name: "Aramayı aç" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute("aria-controls", "mobil-arama");
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);

    // Geniş ekran formu 375px'te görünmüyor; tek dokunuş paneli açıyor.
    await expect(page.locator("#header-search")).toBeHidden();
    await expect(page.locator("#mobil-arama")).toHaveCount(0);

    await trigger.click();

    const panel = page.locator("#mobil-arama");
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const input = panel.locator("input[name='q']");
    await expect(input).toBeFocused();
    // Modal değil: sayfa kaydırması kilitlenmiyor.
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

    // Esc kapatıyor ve focus tetikleyiciye dönüyor.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    expect(await headerHeight(page)).toBeLessThanOrEqual(110);

    // Klavye ile aç, yaz, Enter ile /ara'ya git.
    await page.keyboard.press("Enter");
    await expect(page.locator("#mobil-arama")).toBeVisible();
    await page.keyboard.type("teknoloji");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/ara\?q=teknoloji$/u, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Sözlükte ara" })).toBeVisible();
  });

  test("an outside click closes the panel", async ({ page }) => {
    await page.goto("/gundem");
    await page.getByRole("button", { name: "Aramayı aç" }).click();
    await expect(page.locator("#mobil-arama")).toBeVisible();

    await page.getByRole("heading", { level: 1 }).click();

    await expect(page.locator("#mobil-arama")).toHaveCount(0);
  });
});

test.describe("wide header search", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("keeps the inline search form and hides the mobile trigger", async ({ page }) => {
    await page.goto("/gundem");

    await expect(page.locator("#header-search")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aramayı aç" })).toBeHidden();

    const height = await page
      .locator("body > header")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(110);

    await page.locator("#header-search").fill("teknoloji");
    await page.locator("#header-search").press("Enter");
    await expect(page).toHaveURL(/\/ara\?q=teknoloji$/u, { timeout: 20_000 });
  });
});
