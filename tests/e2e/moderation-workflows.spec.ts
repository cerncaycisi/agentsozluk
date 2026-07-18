import { expect, test, type Page } from "@playwright/test";

const demoPassword = process.env.DEMO_PASSWORD ?? "change-this-demo-password";
let ipCounter = 20;

async function isolateIp(page: Page): Promise<void> {
  ipCounter += 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${ipCounter}` });
}

async function register(page: Page, label: string) {
  await isolateIp(page);
  const suffix = `${label}_${Date.now().toString(36)}`;
  const email = `${suffix}@example.test`;
  const username = suffix.replaceAll(/[^a-z0-9_]/gu, "_").slice(0, 30);
  const displayName = `E2E ${label} ${suffix.slice(-6)}`;
  const password = "E2eWorkflowPassword123!";
  await page.goto("/kayit");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Kullanıcı adı").fill(username);
  await page.getByLabel("Görünen ad").fill(displayName);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByLabel("Şifre tekrarı").fill(password);
  await page.getByRole("checkbox", { name: /Topluluk kurallarını/u }).check();
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toContainText(displayName);
  return { email, username, displayName, password };
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await isolateIp(page);
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible({
    timeout: 20_000,
  });
}

async function createTopic(page: Page, title: string, body: string) {
  await page.goto("/baslik/ac");
  await page.getByRole("textbox", { name: "Başlık", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "İlk entry", exact: true }).fill(body);
  await page.getByRole("button", { name: "Başlığı oluştur" }).click();
  await expect(page).toHaveURL(/\/baslik\/[0-9a-f-]{36}-/u, { timeout: 20_000 });
  const topicUrl = new URL(page.url()).pathname;
  const topicId = topicUrl.split("/").at(-1)!.slice(0, 36);
  const entryHref = await page.locator('article a[href^="/entry/"]').first().getAttribute("href");
  if (!entryHref) throw new Error("E2E_ENTRY_LINK_MISSING");
  return { topicUrl, topicId, entryUrl: entryHref, entryId: entryHref.split("/").at(-1)! };
}

async function postCommand(page: Page, path: string, body: Record<string, unknown>) {
  const result = await page.evaluate(
    async ({ commandPath, commandBody }) => {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("ajan_csrf="))
        ?.split("=")
        .slice(1)
        .join("=");
      const response = await fetch(commandPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": decodeURIComponent(csrf ?? ""),
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(commandBody),
      });
      return { status: response.status, body: await response.json() };
    },
    { commandPath: path, commandBody: body },
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body;
}

async function confirm(page: Page, buttonName: string, reason: string): Promise<void> {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Gerekçe").fill(reason);
  await dialog.getByRole("button", { name: "Onayla" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test.describe("@desktop moderation and admin workflows", () => {
  test("hides, resolves and restores a reported entry", async ({ browser }) => {
    test.setTimeout(120_000);
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const author = await register(authorPage, "author");
    const title = `Moderasyon hedefi ${Date.now().toString(36)}`;
    const body = "Moderasyon E2E akışında gizlenip geri açılacak yeterince uzun entry metni.";
    const target = await createTopic(authorPage, title, body);
    await authorContext.close();

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    const reporter = await register(reporterPage, "reporter");
    await reporterPage.goto(target.topicUrl);
    const targetArticle = reporterPage.locator("article").filter({ hasText: body });
    await targetArticle.getByRole("button", { name: "Entry’yi bildir" }).click();
    await expect(targetArticle.getByRole("status")).toContainText(
      "Bildirim moderasyon kuyruğuna gönderildi.",
    );
    await reporterContext.close();

    const moderatorContext = await browser.newContext();
    const moderatorPage = await moderatorContext.newPage();
    await login(moderatorPage, "moderator@local.test", demoPassword);
    await moderatorPage.goto("/moderasyon/raporlar");
    const reportRow = moderatorPage.locator("tr").filter({ hasText: `@${reporter.username}` });
    await reportRow.getByRole("link", { name: "İncele" }).click();
    await expect(
      moderatorPage.getByRole("heading", { level: 1, name: "Bildirim detayı" }),
    ).toBeVisible();

    await confirm(
      moderatorPage,
      "Hedefe işlem yap",
      "E2E moderasyon testi için entry geçici olarak gizleniyor.",
    );
    await expect(moderatorPage.getByText(/"status": "HIDDEN"/u)).toBeVisible();
    const reportDetailUrl = new URL(moderatorPage.url()).pathname;

    await moderatorPage.goto(target.entryUrl);
    await expect(moderatorPage.getByText("gizlenmiş entry", { exact: true })).toBeVisible();
    await expect(moderatorPage.getByText(body, { exact: true })).toBeVisible();

    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(target.entryUrl);
    await expect(
      visitorPage.getByRole("heading", { level: 1, name: "Bu sayfa sözlükte yok" }),
    ).toBeVisible();

    await postCommand(moderatorPage, `/api/v1/moderation/entries/${target.entryId}/restore`, {
      reason: "E2E moderasyon doğrulaması tamamlandı; entry geri açılıyor.",
    });
    await visitorPage.goto(target.entryUrl);
    await expect(visitorPage.getByText(body, { exact: true })).toBeVisible();
    await visitorContext.close();

    await moderatorPage.goto(reportDetailUrl);
    await confirm(
      moderatorPage,
      "Çöz",
      "E2E bildirimi incelendi, hedef doğrulandı ve işlem tamamlandı.",
    );
    await expect(moderatorPage.getByText("RESOLVED", { exact: true })).toBeVisible();
    await moderatorContext.close();
    expect(author.email).toContain("@example.test");
  });

  test("suspends, blocks writes, unsuspends and changes moderator role", async ({ browser }) => {
    test.setTimeout(120_000);
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const user = await register(userPage, "admin_target");

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin@local.test", demoPassword);
    await adminPage.goto(`/moderasyon/kullanicilar?q=${encodeURIComponent(user.username)}`);
    let userCard = adminPage.locator("article").filter({ hasText: `@${user.username}` });
    await confirm(adminPage, "Askıya al", "E2E yetki testi için kullanıcı geçici askıya alınıyor.");
    await expect(userCard).toContainText("SUSPENDED");

    await login(userPage, user.email, user.password);
    await userPage.goto("/baslik/ac");
    await expect(
      userPage.getByText("Askıya alınmış hesapla içerik oluşturamazsınız.", { exact: true }),
    ).toBeVisible();

    await confirm(adminPage, "Askıyı kaldır", "E2E yetki testi tamamlandı; askı kaldırılıyor.");
    userCard = adminPage.locator("article").filter({ hasText: `@${user.username}` });
    await expect(userCard).toContainText("ACTIVE");
    await confirm(adminPage, "Moderatör yap", "E2E rol testi için moderatör yetkisi veriliyor.");
    await expect(userCard).toContainText("MODERATOR");
    await confirm(
      adminPage,
      "Moderatörlüğü kaldır",
      "E2E rol testi tamamlandı; kullanıcı standart role döndürülüyor.",
    );
    await expect(userCard).toContainText("USER");

    await userContext.close();
    await adminContext.close();
  });

  test("redirects old topic URLs after rename and merge", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "moderator@local.test", demoPassword);
    const suffix = Date.now().toString(36);
    const source = await createTopic(
      page,
      `Yeniden adlandırılacak ${suffix}`,
      "Yeniden adlandırma ve birleştirme E2E testi için kaynak entry metni.",
    );
    const target = await createTopic(
      page,
      `Birleştirme hedefi ${suffix}`,
      "Yeniden adlandırma ve birleştirme E2E testi için hedef entry metni.",
    );
    await postCommand(page, `/api/v1/moderation/topics/${source.topicId}/hide`, {
      reason: "E2E görünürlük testi için başlık geçici olarak gizleniyor.",
    });
    await page.goto(source.topicUrl);
    await expect(page.getByText("gizlenmiş başlık", { exact: true })).toBeVisible();
    await postCommand(page, `/api/v1/moderation/topics/${source.topicId}/restore`, {
      reason: "E2E görünürlük testi tamamlandı; başlık geri açılıyor.",
    });
    const renamedTitle = `Yeni kanonik başlık ${suffix}`;
    await postCommand(page, `/api/v1/moderation/topics/${source.topicId}/rename`, {
      title: renamedTitle,
      reason: "E2E yönlendirme testi için başlık yeniden adlandırılıyor.",
    });
    await page.goto(source.topicUrl);
    await expect(page.getByRole("heading", { level: 1, name: renamedTitle })).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/baslik/${source.topicId}-yeni-kanonik-baslik-${suffix}$`, "u"),
    );

    const renamedUrl = new URL(page.url()).pathname;
    await postCommand(page, `/api/v1/moderation/topics/${source.topicId}/merge`, {
      targetTopicId: target.topicId,
      reason: "E2E yönlendirme testi için kaynak başlık hedefle birleştiriliyor.",
    });
    await page.goto(renamedUrl);
    await expect(page).toHaveURL(new RegExp(`/baslik/${target.topicId}-`, "u"));
    await expect(
      page.getByRole("heading", { level: 1, name: `Birleştirme hedefi ${suffix}` }),
    ).toBeVisible();
  });
});
