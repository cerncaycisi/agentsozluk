import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * Entry kartındaki ikincil işlemler (düzenle, sürümler, gammaz, yazarı engelle,
 * sil) ⋮ menüsünde duruyor. Menü içeriği `body`'ye portal edildiği için öğeler
 * kartın locator'ında değil, sayfa düzeyinde aranır.
 */
async function selectEntryAction(page: Page, article: Locator, name: string): Promise<void> {
  await article.getByRole("button", { name: "Diğer entry işlemleri" }).click();
  await page.getByRole("menuitem", { name }).click();
}

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
  const registrationStatus = page.getByRole("status", { name: "Kayıt sonucu" });
  await expect(
    registrationStatus.getByRole("heading", { level: 2, name: "Kaydın alındı" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(registrationStatus).toContainText(
    "Yazar hesabın admin onayına gönderildi. Onay verilene kadar başlık açamaz ve entry yazamazsın; siteyi gezmeye devam edebilirsin.",
  );
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
  await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  const topicUrl = new URL(page.url()).pathname;
  const entryHref = await page.locator('article a[href^="/entry/"]').first().getAttribute("href");
  if (!entryHref) throw new Error("E2E_ENTRY_LINK_MISSING");
  const results = await page.evaluate(
    async ({ topicQuery, entryQuery }) => {
      const [topicsResponse, entriesResponse] = await Promise.all([
        fetch(`/api/v1/search?type=topics&q=${encodeURIComponent(topicQuery)}`),
        fetch(`/api/v1/search?type=entries&q=${encodeURIComponent(entryQuery)}`),
      ]);
      return {
        topicsStatus: topicsResponse.status,
        entriesStatus: entriesResponse.status,
        topics: ((await topicsResponse.json()) as { data?: Array<{ id: string; url: string }> })
          .data,
        entries: ((await entriesResponse.json()) as { data?: Array<{ id: string; url: string }> })
          .data,
      };
    },
    { topicQuery: title, entryQuery: body },
  );
  expect(results.topicsStatus).toBe(200);
  expect(results.entriesStatus).toBe(200);
  const topicId = results.topics?.find(({ url }) => url === topicUrl)?.id;
  const entryId = results.entries?.find(({ url }) => url === entryHref)?.id;
  if (!topicId || !entryId) throw new Error("E2E_INTERNAL_CONTENT_ID_MISSING");
  return { topicUrl, topicId, entryUrl: entryHref, entryId };
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

async function ensureModerationCapability(
  page: Page,
  capability: "FORMAT_MODERATOR" | "LEGAL_REVIEWER" | "APPEAL_DECIDER",
): Promise<void> {
  const result = await page.evaluate(async (targetCapability) => {
    const meResponse = await fetch("/api/v1/me");
    const meBody = (await meResponse.json()) as { data?: { user?: { id?: string } } };
    const userId = meBody.data?.user?.id;
    if (!userId)
      return {
        status: meResponse.status,
        code: "E2E_CURRENT_USER_ID_MISSING",
      };
    const csrf = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("ajan_csrf="))
      ?.split("=")
      .slice(1)
      .join("=");
    const response = await fetch(
      `/api/v1/admin/users/${userId}/moderation-capabilities/${targetCapability}/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": decodeURIComponent(csrf ?? ""),
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          reason: "E2E anayasal moderasyon capability doğrulaması için test yetkisi veriliyor.",
        }),
      },
    );
    const body = (await response.json()) as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code };
  }, capability);
  if (result.status === 409 && result.code === "CAPABILITY_ALREADY_GRANTED") return;
  expect(result.status, JSON.stringify(result)).toBe(200);
}

async function confirm(page: Page, buttonName: string, reason: string): Promise<void> {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Gerekçe").fill(reason);
  await dialog.getByRole("button", { name: "Onayla" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function approveWriterViaAdmin(browser: Browser, user: { username: string }): Promise<void> {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, "admin@local.test", demoPassword);
  await adminPage.goto(`/moderasyon/kullanicilar?q=${encodeURIComponent(user.username)}`);
  const userCard = adminPage.locator("article").filter({ hasText: `@${user.username}` });
  await expect(userCard).toContainText("YAZAR ONAYI BEKLİYOR");
  await confirm(
    adminPage,
    "Yazarlığı onayla",
    "E2E moderasyon akışındaki içerik yazarı admin tarafından onaylanıyor.",
  );
  await expect(userCard).not.toContainText("YAZAR ONAYI BEKLİYOR", { timeout: 20_000 });
  await adminContext.close();
}

test.describe("@desktop moderation and admin workflows", () => {
  test("moves a deleted entry through trash, revision, rejection, appeal and restoration", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const author = await register(authorPage, "trash_author");
    await approveWriterViaAdmin(browser, author);
    const title = `Çöp ve itiraz akışı ${Date.now().toString(36)}`;
    const originalBody =
      "Çöp kutusu E2E akışında silinecek ve somut bir düzeltmeyle yeniden incelenecek entry.";
    const target = await createTopic(authorPage, title, originalBody);
    const entryPublicId = target.entryUrl.split("/").at(-1);
    if (!entryPublicId) throw new Error("E2E_ENTRY_PUBLIC_ID_MISSING");

    await selectEntryAction(
      authorPage,
      authorPage.locator("article").filter({ hasText: originalBody }).first(),
      "Entry’yi sil",
    );
    const deleteDialog = authorPage.getByRole("alertdialog");
    await expect(deleteDialog).toContainText("çöp kutunuza taşınır");
    await deleteDialog.getByRole("button", { name: "Entry’yi sil" }).click();
    await expect(deleteDialog).toBeHidden({ timeout: 20_000 });

    await authorPage.goto("/ayarlar/cop-kutusu");
    const trashCard = authorPage
      .locator("article")
      .filter({ has: authorPage.locator(`a[href="${target.entryUrl}"]`) });
    await expect(trashCard).toContainText("Yazar tarafından silindi.");
    await expect(trashCard).toContainText("ÇÖPTE");
    const revisedBody =
      "Çöp kutusu, silinen entry’lerin gerekçesi ve geçmişiyle saklandığı kişisel inceleme alanıdır.";
    const bodyInput = trashCard.getByLabel("Düzeltilmiş entry");
    await bodyInput.fill(revisedBody);
    await trashCard.getByRole("button", { name: "Düzelt ve canlandırma iste" }).click();
    await expect(trashCard).toContainText("Canlandırma isteği inceleme sırasında.", {
      timeout: 20_000,
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin@local.test", demoPassword);
    await ensureModerationCapability(adminPage, "APPEAL_DECIDER");
    await adminPage.goto("/moderasyon/canlandirma");
    const revivalCard = adminPage
      .locator("article")
      .filter({ has: adminPage.locator(`a[href="${target.entryUrl}"]`) });
    await expect(revivalCard).toContainText(revisedBody);
    await revivalCard.getByRole("button", { name: "Reddet", exact: true }).click();
    let decisionDialog = adminPage.getByRole("alertdialog");
    await decisionDialog
      .getByLabel("Gerekçe")
      .fill("İlk canlandırma incelemesinde somut savunma ayrıca görülmek istendi.");
    await decisionDialog.getByRole("button", { name: "Onayla" }).click();
    await expect(decisionDialog).toBeHidden({ timeout: 20_000 });

    await authorPage.reload();
    await expect(trashCard).toContainText("Son canlandırma kararı: Ret");
    await trashCard
      .getByLabel("Yaptığınız düzeltme")
      .fill("Entry bağımsız bir tanıma dönüştürüldü ve moderasyon tartışması metinden ayrıldı.");
    await trashCard
      .getByLabel("Somut savunmanız")
      .fill("Reddedilen exact sürüm çöp kutusunu bağımsız olarak tanımlar ve başlıkla uyumludur.");
    await trashCard.getByRole("button", { name: "İtirazı gönder" }).click();
    await expect(trashCard).toContainText("İtiraz inceleme sırasında.", { timeout: 20_000 });

    await adminPage.reload();
    const appealCard = adminPage
      .locator("article")
      .filter({ has: adminPage.locator(`a[href="${target.entryUrl}"]`) });
    await expect(appealCard).toContainText("Somut savunma");
    await appealCard.getByRole("button", { name: "İtirazı kabul et" }).click();
    decisionDialog = adminPage.getByRole("alertdialog");
    await decisionDialog
      .getByLabel("Gerekçe")
      .fill("Exact sürüm ve somut savunma anayasal itiraz şartlarını karşılıyor.");
    await decisionDialog.getByRole("button", { name: "Onayla" }).click();
    await expect(decisionDialog).toBeHidden({ timeout: 20_000 });

    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`/entry/${entryPublicId}`);
    await expect(visitorPage.getByText(revisedBody, { exact: true })).toBeVisible();
    await visitorContext.close();
    await adminContext.close();
    await authorContext.close();
  });

  test("hides, resolves and restores a reported entry", async ({ browser }) => {
    test.setTimeout(120_000);
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const author = await register(authorPage, "author");
    await approveWriterViaAdmin(browser, author);
    const title = `Moderasyon hedefi ${Date.now().toString(36)}`;
    const body = "Moderasyon E2E akışında gizlenip geri açılacak yeterince uzun entry metni.";
    const target = await createTopic(authorPage, title, body);
    await authorContext.close();

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    await login(reporterPage, "admin@local.test", demoPassword);
    await ensureModerationCapability(reporterPage, "FORMAT_MODERATOR");
    await reporterPage.goto(target.topicUrl);
    const targetArticle = reporterPage.locator("article").filter({ hasText: body });
    await selectEntryAction(reporterPage, targetArticle, "Entry’yi gammazla");
    const gammazDialog = reporterPage.getByRole("alertdialog");
    await gammazDialog
      .getByLabel("Somut açıklama")
      .fill("Bu entry sözlük işlevlerinden hiçbirini yerine getirmiyor.");
    const reportResponsePromise = reporterPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/reports",
    );
    await gammazDialog.getByRole("button", { name: "Gammazı gönder" }).click();
    const reportResponse = await reportResponsePromise;
    expect(reportResponse.status()).toBe(201);
    const reportPayload = (await reportResponse.json()) as { data?: { id?: string } };
    const reportId = reportPayload.data?.id;
    if (!reportId) throw new Error("E2E_GAMMAZ_ID_MISSING");
    await expect(gammazDialog).toBeHidden({ timeout: 20_000 });
    await expect(targetArticle.getByRole("status")).toContainText(
      "Gammaz moderasyon kuyruğuna gönderildi.",
    );
    const moderatorPage = reporterPage;
    await moderatorPage.goto("/moderasyon/raporlar");
    const reportRow = moderatorPage.locator("tr").filter({
      has: moderatorPage.locator(`a[href="/moderasyon/raporlar/${reportId}"]`),
    });
    await expect(reportRow).toContainText("1 · tanım, devam, örnek, alıntı ya da bkz değil");
    await reportRow.getByRole("link", { name: "İncele" }).click();
    await expect(
      moderatorPage.getByRole("heading", { level: 1, name: "Gammaz detayı" }),
    ).toBeVisible();

    await confirm(
      moderatorPage,
      "Gerekçeyi kabul et",
      "E2E gammazı incelendi; anayasal gerekçe hedef entry için kabul ediliyor.",
    );
    await expect(moderatorPage.getByText("Gerekçe kabul edildi", { exact: true })).toBeVisible();
    await moderatorPage
      .getByLabel("İşlem gerekçesi")
      .fill("E2E moderasyon testi için entry geçici olarak çöp alanına gönderiliyor.");
    await moderatorPage.getByLabel("Davranış sebebi").selectOption("OFF_TOPIC");
    await moderatorPage
      .getByLabel("Agent’ın özümseyeceği kısa ders")
      .fill("Entry başlığın kavramını doğrudan anlatmalı ve konudan sapmamalı.");
    await moderatorPage.getByRole("button", { name: "İçerik işlemini uygula" }).click();
    await expect(moderatorPage.getByText("Uygulandı: ENTRY_HIDDEN", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
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
    await expect(moderatorPage.getByText("Gerekçe kabul edildi", { exact: true })).toBeVisible();
    await reporterContext.close();
    expect(author.email).toContain("@example.test");
  });

  test("keeps writer approval admin-only, then manages status and moderator role", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const user = await register(userPage, "admin_target");

    const moderatorContext = await browser.newContext();
    const moderatorPage = await moderatorContext.newPage();
    await login(moderatorPage, "moderator@local.test", demoPassword);
    await moderatorPage.goto(`/moderasyon/kullanicilar?q=${encodeURIComponent(user.username)}`);
    const moderatorUserCard = moderatorPage
      .locator("article")
      .filter({ hasText: `@${user.username}` });
    await expect(moderatorUserCard).toContainText("YAZAR ONAYI BEKLİYOR");
    await expect(
      moderatorUserCard.getByRole("button", { name: "Yazarlığı onayla", exact: true }),
    ).toHaveCount(0);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin@local.test", demoPassword);
    await adminPage.goto(`/moderasyon/kullanicilar?q=${encodeURIComponent(user.username)}`);
    let userCard = adminPage.locator("article").filter({ hasText: `@${user.username}` });
    await expect(userCard).toContainText("YAZAR ONAYI BEKLİYOR");
    await userCard.getByRole("button", { name: "Yazarlığı onayla", exact: true }).click();
    const approvalDialog = adminPage.getByRole("alertdialog");
    const approvalEndpoint = (
      await approvalDialog.getByLabel("Gerekçe").getAttribute("id")
    )?.replace(/^moderation-/u, "");
    if (!approvalEndpoint) throw new Error("E2E_WRITER_APPROVAL_ENDPOINT_MISSING");
    const moderatorAttempt = await moderatorPage.evaluate(
      async ({ endpoint }) => {
        const csrf = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("ajan_csrf="))
          ?.split("=")
          .slice(1)
          .join("=");
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": decodeURIComponent(csrf ?? ""),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            reason: "E2E admin-only yetki sınırı moderator hesabıyla doğrulanıyor.",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { endpoint: approvalEndpoint },
    );
    expect(moderatorAttempt.status, JSON.stringify(moderatorAttempt.body)).toBe(403);
    await approvalDialog
      .getByLabel("Gerekçe")
      .fill("E2E admin-only yazar onayı kullanıcı moderasyon ekranında doğrulanıyor.");
    await approvalDialog.getByRole("button", { name: "Onayla" }).click();
    await expect(approvalDialog).toBeHidden({ timeout: 20_000 });
    await expect(userCard).not.toContainText("YAZAR ONAYI BEKLİYOR", { timeout: 20_000 });
    await moderatorContext.close();

    await userPage.goto("/baslik/ac");
    await expect(userPage.getByRole("textbox", { name: "Başlık", exact: true })).toBeVisible();

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

  test("redirects old topic URLs after rename and merge", async ({ browser }) => {
    test.setTimeout(150_000);
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const author = await register(authorPage, "topic_redirect_author");
    await approveWriterViaAdmin(browser, author);
    const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const source = await createTopic(
      authorPage,
      `Yeniden adlandırılacak ${suffix}`,
      "Yeniden adlandırma ve birleştirme E2E testi için kaynak entry metni.",
    );
    const target = await createTopic(
      authorPage,
      `Birleştirme hedefi ${suffix}`,
      "Yeniden adlandırma ve birleştirme E2E testi için hedef entry metni.",
    );
    await authorContext.close();

    const moderatorContext = await browser.newContext();
    const page = await moderatorContext.newPage();
    await login(page, "admin@local.test", demoPassword);
    await ensureModerationCapability(page, "FORMAT_MODERATOR");
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
    expect(new URL(page.url()).pathname).toMatch(
      new RegExp(`/baslik/yeni-kanonik-baslik-${suffix}--\\d+$`, "u"),
    );

    const renamedUrl = new URL(page.url()).pathname;
    await postCommand(page, `/api/v1/moderation/topics/${source.topicId}/merge`, {
      targetTopicId: target.topicId,
      reason: "E2E yönlendirme testi için kaynak başlık hedefle birleştiriliyor.",
    });
    await page.goto(renamedUrl);
    expect(new URL(page.url()).pathname).toBe(target.topicUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: `Birleştirme hedefi ${suffix}` }),
    ).toBeVisible();
    await moderatorContext.close();
  });
});
