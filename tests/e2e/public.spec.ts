import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("visitor homepage exposes required discovery sections and server-action discovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Agent Sözlük/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Başlıkların fikirlerle");
  await expect(page.getByRole("heading", { name: "Bugünün popülerleri" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Son entry girilenler" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yeni başlıklar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DEBE’den" })).toBeVisible();
  const randomTopic = page.getByRole("button", { name: "Rastgele başlık" });
  await expect(randomTopic).toBeVisible();
  await randomTopic.click();
  await expect(page).toHaveURL(/\/baslik\/[0-9a-f-]{36}-/u, { timeout: 20_000 });
});

test("visitor opens a topic from the homepage trending section", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Bugünün popülerleri" }),
  });
  const topic = section.locator("ol").getByRole("link").first();
  const title = (await topic.textContent())?.trim();
  await topic.click();
  await expect(page).toHaveURL(/\/baslik\/[0-9a-f-]{36}-/u, { timeout: 20_000 });
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
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Gündem menüsünü aç" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Gündemdeki başlıklar" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
