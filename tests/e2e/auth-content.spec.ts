import { expect, test } from "@playwright/test";

test.describe("authenticated content journey", () => {
  test.skip(({ isMobile }) => isMobile, "The mutation journey runs once on desktop.");

  test("registers, publishes, revises, saves, follows, signs out and signs back in", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const suffix = Date.now().toString(36);
    const email = `e2e-${suffix}@example.test`;
    const username = `e2e_${suffix}`;
    const displayName = `E2E Kullanıcı ${suffix}`;
    const password = "E2eParola12345";
    const topicTitle = `E2E doğrulama başlığı ${suffix}`;
    const firstEntry = `Bu, ${suffix} çalıştırması için oluşturulan ilk doğrulama entry metnidir.`;
    const secondEntry = `Bu, ${suffix} çalıştırmasındaki düzenlenecek ikinci entry metnidir.`;
    const revisedEntry = `${secondEntry} Düzenleme başarıyla kaydedildi.`;

    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `203.0.113.${(Date.now() % 250) + 1}`,
    });
    await page.goto("/kayit");
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Kullanıcı adı").fill(username);
    await page.getByLabel("Görünen ad").fill(displayName);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByLabel("Şifre tekrarı").fill(password);
    await page.getByRole("checkbox", { name: /Topluluk kurallarını/u }).check();
    await page.getByRole("button", { name: "Hesap oluştur" }).click();

    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toContainText(
      displayName,
    );

    await page.goto("/baslik/ac");
    await page.getByRole("textbox", { name: "Başlık", exact: true }).fill(topicTitle);
    await page.getByRole("textbox", { name: "İlk entry", exact: true }).fill(firstEntry);
    await page.getByRole("button", { name: "Başlığı oluştur" }).click();

    await expect(page).toHaveURL(/\/baslik\/[0-9a-f-]{36}-/u, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: topicTitle })).toBeVisible();
    await expect(page.getByText(firstEntry, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Başlığı takip et" }).click();
    await expect(page.getByRole("button", { name: "Takibi bırak" })).toBeVisible();

    await page.getByLabel("Yeni entry").fill(secondEntry);
    await page.getByRole("button", { name: "Entry ekle" }).click();
    await expect(page.getByRole("status")).toContainText("Entry eklendi.");

    const secondArticle = page.locator("article").filter({ hasText: secondEntry });
    await expect(secondArticle).toHaveCount(1);
    await secondArticle.getByRole("button", { name: "Favorilere ekle" }).click();
    await expect(secondArticle.getByRole("button", { name: "Favorilerden çıkar" })).toBeVisible();

    await secondArticle.getByRole("button", { name: "Entry’yi düzenle" }).click();
    await secondArticle.getByLabel("Entry metni").fill(revisedEntry);
    await secondArticle.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText(revisedEntry, { exact: true })).toBeVisible();

    const revisedArticle = page.locator("article").filter({ hasText: revisedEntry });
    await revisedArticle.getByRole("link", { name: "Sürümler" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entry sürümleri" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(secondEntry, { exact: true })).toBeVisible();

    await page.goto("/favoriler");
    await expect(page.getByRole("heading", { level: 1, name: "Favoriler" })).toBeVisible();
    await expect(page.getByText(revisedEntry, { exact: true })).toBeVisible();

    await page.goto("/takip");
    await expect(
      page.getByRole("heading", { level: 1, name: "Takip edilen başlıklar" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: topicTitle, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Hesap menüsünü aç" }).click();
    await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
    await expect(page.getByRole("link", { name: "Giriş", exact: true })).toBeVisible();

    await page.goto("/giris");
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre").fill(password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toContainText(
      displayName,
    );
  });
});

test.describe("mobile content journey", () => {
  test.skip(({ isMobile }) => !isMobile, "This journey verifies the mobile composition UI.");

  test("publishes an entry from the mobile topic view", async ({ page }) => {
    test.setTimeout(60_000);
    const body = `Mobil E2E ${Date.now().toString(36)} çalıştırmasında yazılan yeterince uzun entry.`;

    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("writer@local.test");
    await page.getByLabel("Şifre").fill(process.env.DEMO_PASSWORD ?? "change-this-demo-password");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(
      "/baslik/00000000-0000-4000-8000-000000000101-yapay-zeka-ile-gundelik-hayat?sort=newest",
    );
    await page.getByLabel("Yeni entry").fill(body);
    await page.getByRole("button", { name: "Entry ekle" }).click();
    await expect(page.getByRole("status")).toContainText("Entry eklendi.");
    await expect(page.getByText(body, { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
