import { expect, test } from "@playwright/test";

test.describe("@desktop authenticated content journey", () => {
  test("registers, publishes, interacts and manages the account lifecycle", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const suffix = Date.now().toString(36);
    const email = `e2e-${suffix}@example.test`;
    const username = `e2e_${suffix}`;
    const displayName = `E2E Kullanıcı ${suffix}`;
    const password = "E2eParola12345";
    const topicTitle = `E2E doğrulama başlığı ${suffix}`;
    const firstEntry = `Bu, ${suffix} çalıştırması için oluşturulan ilk doğrulama entry metnidir.`;
    const duplicateEntry = `Bu, ${suffix} duplicate akışında korunup mevcut başlığa gönderilen entry metnidir.`;
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

    await expect(page).toHaveURL(/\/$/u, { timeout: 20_000 });
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
    const topicUrl = new URL(page.url()).pathname;

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
    await expect(revisedArticle.getByLabel("Entry düzenlendi")).toBeVisible();
    const revisedPermalinkLink = revisedArticle.locator('a[href^="/entry/"]').first();
    const revisedPermalink = await revisedPermalinkLink.getAttribute("href");
    if (!revisedPermalink) throw new Error("E2E_REVISED_ENTRY_LINK_MISSING");
    const revisedEntryId = revisedPermalink.split("/").at(-1)!;
    await revisedPermalinkLink.click();
    await expect(page).toHaveURL(new RegExp(`${revisedPermalink}$`, "u"));
    await expect(page.locator(`#entry-${revisedEntryId}`)).toBeVisible();
    await expect(
      page.getByRole("link", { name: `${topicTitle} başlığında bu entry’ye git` }),
    ).toHaveAttribute("href", `${topicUrl}#entry-${revisedEntryId}`);

    await page.goto(topicUrl);
    const revisedTopicArticle = page.locator("article").filter({ hasText: revisedEntry });
    await revisedTopicArticle.getByRole("link", { name: "Sürümler" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entry sürümleri" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(secondEntry, { exact: true })).toBeVisible();

    const duplicateContext = await browser.newContext();
    const duplicatePage = await duplicateContext.newPage();
    await duplicatePage.setExtraHTTPHeaders({ "x-forwarded-for": "203.0.113.251" });
    await duplicatePage.goto("/giris");
    await duplicatePage.getByLabel("E-posta").fill("writer@local.test");
    await duplicatePage
      .getByLabel("Şifre")
      .fill(process.env.DEMO_PASSWORD ?? "change-this-demo-password");
    await duplicatePage.getByRole("button", { name: "Giriş yap" }).click();
    await expect(duplicatePage.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible({
      timeout: 20_000,
    });
    await duplicatePage.goto("/baslik/ac");
    await duplicatePage.getByRole("textbox", { name: "Başlık", exact: true }).fill(topicTitle);
    await duplicatePage
      .getByRole("textbox", { name: "İlk entry", exact: true })
      .fill(duplicateEntry);
    await duplicatePage.getByRole("button", { name: "Başlığı oluştur" }).click();
    await expect(
      duplicatePage.getByRole("heading", { level: 2, name: "Bu başlık zaten var" }),
    ).toBeVisible();
    await expect(
      duplicatePage.getByRole("textbox", { name: "İlk entry", exact: true }),
    ).toHaveValue(duplicateEntry);
    await expect(
      duplicatePage.getByRole("link", { name: topicTitle, exact: true }),
    ).toHaveAttribute("href", topicUrl);
    await duplicatePage.getByRole("button", { name: "İlk entry’yi mevcut başlığa gönder" }).click();
    await expect(duplicatePage).toHaveURL(/\/baslik\/[0-9a-f-]{36}-[^#]+#entry-[0-9a-f-]{36}$/u, {
      timeout: 20_000,
    });
    await expect(duplicatePage.getByText(duplicateEntry, { exact: true })).toBeVisible();
    await duplicateContext.close();

    await page.goto(topicUrl);
    await page.getByLabel("Başlık içinde ara").fill("duplicate akışında");
    await page.getByRole("button", { name: "Başlıkta ara" }).click();
    await expect(page).toHaveURL(/\?sort=oldest&q=/u);
    await expect(page.getByText(duplicateEntry, { exact: true })).toBeVisible();
    await expect(page.getByText(firstEntry, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Yeniden eskiye" })).toHaveAttribute(
      "href",
      /q=duplicate%20ak%C4%B1%C5%9F%C4%B1nda/u,
    );
    await page.getByRole("link", { name: "Aramayı temizle" }).click();
    await expect(page.getByText(firstEntry, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Başlığı bildir" })).toHaveCount(0);

    await page.goto("/favoriler");
    await expect(page.getByRole("heading", { level: 1, name: "Favoriler" })).toBeVisible();
    await expect(page.getByText(revisedEntry, { exact: true })).toBeVisible();

    await page.goto("/takip");
    await expect(
      page.getByRole("heading", { level: 1, name: "Takip edilen başlıklar" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: topicTitle, exact: true })).toBeVisible();

    await page.goto("/baslik/00000000-0000-4000-8000-000000000101-yapay-zeka-ile-gundelik-hayat");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Başlığı bildir" }).click();
    await expect(page.getByRole("status").first()).toContainText(
      "Başlık moderasyon kuyruğuna gönderildi.",
    );
    const seededArticle = page.locator("article").filter({ hasText: "@writer" }).first();
    await seededArticle.getByRole("button", { name: "Artı oy ver" }).click();
    await expect(seededArticle.getByRole("button", { name: "Artı oy ver" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await seededArticle.getByRole("button", { name: "Eksi oy ver" }).click();
    await expect(seededArticle.getByRole("button", { name: "Eksi oy ver" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await seededArticle.getByRole("button", { name: "Eksi oy ver" }).click();
    await expect(seededArticle.getByRole("button", { name: "Eksi oy ver" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await seededArticle.getByRole("button", { name: "Entry’yi bildir" }).click();
    await expect(seededArticle.getByRole("status")).toContainText(
      "Bildirim moderasyon kuyruğuna gönderildi.",
    );

    await seededArticle.getByRole("button", { name: "Yazarı engelle" }).click();
    const blockedArticle = page
      .locator("article")
      .filter({ hasText: "Bu entry engellediğiniz bir yazar tarafından yazıldı." })
      .first();
    await expect(blockedArticle).toBeVisible();
    await expect(
      blockedArticle.getByRole("button", { name: "Yazarın engelini kaldır" }),
    ).toBeVisible();
    await blockedArticle.getByRole("button", { name: "Entry’yi bir kez göster" }).click();
    await expect(
      blockedArticle.getByText("Bu entry engellediğiniz bir yazar tarafından yazıldı."),
    ).toHaveCount(0);
    await page.goto("/ayarlar/engellenenler");
    await expect(page.getByRole("link", { name: "@writer" })).toBeVisible();
    await page.getByRole("link", { name: "@writer" }).click();
    await page.getByRole("button", { name: "Engeli kaldır" }).click();
    await expect(page.getByRole("status")).toContainText("Engel kaldırıldı.");
    await page.goto("/ayarlar/engellenenler");
    await expect(page.getByText("Bu listede henüz kayıt yok.", { exact: true })).toBeVisible();

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

    const secondaryContext = await browser.newContext({ userAgent: "AgentSozluk-E2E-Secondary" });
    const secondaryPage = await secondaryContext.newPage();
    await secondaryPage.goto("/giris");
    await secondaryPage.getByLabel("E-posta").fill(email);
    await secondaryPage.getByLabel("Şifre").fill(password);
    await secondaryPage.getByRole("button", { name: "Giriş yap" }).click();
    await expect(secondaryPage.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible();

    await page.goto("/ayarlar/oturumlar");
    const secondarySession = page.locator("li").filter({ hasText: "AgentSozluk-E2E-Secondary" });
    await secondarySession.getByRole("button", { name: "Erişimi kaldır" }).click();
    await expect(page.getByRole("status")).toContainText("Oturum kapatıldı.");
    await secondaryContext.close();

    const updatedDisplayName = `${displayName} Güncel`;
    await page.goto("/ayarlar");
    await page.getByLabel("Görünen ad").fill(updatedDisplayName);
    await page.getByLabel("Hakkında").fill("E2E profil güncelleme doğrulaması.");
    await page.getByRole("button", { name: "Profili kaydet" }).click();
    await expect(page.getByRole("status")).toContainText("Profiliniz güncellendi.");

    const newPassword = "E2eYeniParola67890";
    await page.goto("/ayarlar/guvenlik");
    const passwordForm = page.locator("form").filter({ hasText: "Şifre değiştir" });
    await passwordForm.getByLabel("Mevcut şifre").fill(password);
    await passwordForm.getByLabel("Yeni şifre", { exact: true }).fill(newPassword);
    await passwordForm.getByLabel("Yeni şifre tekrarı").fill(newPassword);
    await passwordForm.getByRole("button", { name: "Şifreyi değiştir" }).click();
    await expect(passwordForm.getByRole("status")).toContainText("Şifreniz değiştirildi");

    await page.getByRole("button", { name: "Hesap menüsünü aç" }).click();
    await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre").fill(newPassword);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toContainText(
      updatedDisplayName,
    );
  });
});

test.describe("@mobile mobile content journey", () => {
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
