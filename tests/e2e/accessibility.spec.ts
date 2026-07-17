import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("@desktop authenticated accessibility", () => {
  test("auth, account and moderation pages have no serious or critical violations", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    for (const path of ["/giris", "/kayit"]) {
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

    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("admin@local.test");
    await page.getByLabel("Şifre").fill(process.env.DEMO_PASSWORD ?? "change-this-demo-password");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible({
      timeout: 20_000,
    });

    for (const path of [
      "/ayarlar",
      "/ayarlar/guvenlik",
      "/ayarlar/oturumlar",
      "/moderasyon",
      "/moderasyon/raporlar",
      "/moderasyon/basliklar",
      "/moderasyon/kullanicilar",
      "/moderasyon/audit",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
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
});
