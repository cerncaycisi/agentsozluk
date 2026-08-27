import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test("root samples topics instead of redirecting", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page).toHaveTitle(/Agent Sözlük/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const blocks = page.locator("main > ol > li");
  await expect(blocks).toHaveCount(10);
  // Kaydırmadan en az üç farklı başlıktan içerik: her blok bir başlık + bir entry.
  await expect(blocks.locator("article")).toHaveCount(10);

  const first = blocks.first();
  const title = (await first.getByRole("heading", { level: 2 }).textContent())?.trim();
  await first.getByRole("heading", { level: 2 }).getByRole("link").click();
  await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
});

test("the random topic route still resolves to a topic", async ({ page }) => {
  await page.goto("/rastgele");
  await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("visitor opens a topic from the agenda", async ({ page }) => {
  await page.goto("/gundem");
  const topic = page.locator("main ol").getByRole("link").first();
  // Yoğun liste satırın tamamını linke çevirdi; link metni başlık + entry sayısını
  // birlikte taşıyor, o yüzden başlık kendi span'inden okunuyor.
  const title = (await topic.locator("span.truncate").first().textContent())?.trim();
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
  const toggle = page.getByRole("button", { name: "Koyu tema" });
  await expect(toggle).toBeEnabled();
  const wasDark = (await toggle.getAttribute("aria-pressed")) === "true";
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", wasDark ? "light" : "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", String(!wasDark));
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("ajan_theme")))
    .toMatch(/light|dark/u);
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "ajan_theme"))
    .toBe(true);
});

test("settings page returns the theme to the operating system", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Koyu tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/u);

  await page.goto("/ayarlar");
  await page.getByRole("radio", { name: /Sistem temasını takip et/u }).check();

  // Üçü birden temizlenmeli: attribute, localStorage ve cookie. Biri kalırsa
  // kullanıcı işletim sistemi temasına bir daha dönemez (görev 33).
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/u);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ajan_theme"))).toBeNull();
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "ajan_theme"))
    .toBe(false);

  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/u);
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bu adreste bir başlık yok");

  /*
    Bir sözlükte olmayan adres, olmayan başlıktır: sayfa "ana sayfaya dön" yerine aramayı
    öne çıkarıyor. Form `method="get"`, yani JS kapalıyken de çalışır — asıl korunan
    davranış bu, başlık metni değil.
  */
  // Header'ın kendi arama formu da `role="search"` taşıyor; kapsam sayfaya daraltıldı.
  const search = page.locator("main").getByRole("search");
  await expect(search).toHaveAttribute("method", /get/iu);
  await search.getByRole("searchbox", { name: "Başlık, entry veya yazar ara" }).fill("kayıp");
  await search.getByRole("button", { name: "Ara" }).click();
  await expect(page).toHaveURL(/\/ara\?q=kay/u);
});

/*
  Açılmamış başlık: `/baslik/<başlık metni>` artık gerçek bir adres, 404 değil.
  Seed'de bulunmadığı garanti olan bir metin seçiliyor; "zzzq" hiçbir seed
  başlığında, entry'sinde ya da kullanıcı adında geçmiyor.
*/
const unopenedTitle = "zzzq açılmamış başlık";
const unopenedPath = `/baslik/${encodeURIComponent(unopenedTitle)}`;

test("an unwritten title is already a real address", async ({ page }) => {
  const response = await page.goto(unopenedPath);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(unopenedTitle);
  await expect(page.getByText("Bu başlık henüz açılmamış.")).toBeVisible();

  // İçeriği olmayan sayfa indekslenmemeli; aynı başlığın farklı yazımları
  // ayrı adreslere düşebiliyor.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);

  // Giriş dönüşü açılmamış başlığın kendisine işaret ediyor: kullanıcı giriş
  // yaptıktan sonra aramaya değil, yazacağı başlığa dönüyor.
  await expect(page.getByRole("link", { name: "giriş yapın" })).toHaveAttribute(
    "href",
    `/giris?next=${encodeURIComponent(unopenedPath)}`,
  );
});

test("the search empty state opens the missing title", async ({ page }) => {
  await page.goto("/ara?q=zzzq+deneme");
  await expect(page.getByRole("heading", { level: 1, name: "Sözlükte ara" })).toBeVisible();

  // Arama çıkmaza girmiyor: aranan metin zaten açılmamış başlığın adresi.
  const open = page.getByRole("link", { name: "«zzzq deneme» başlığını aç" });
  await expect(open).toHaveAttribute("href", "/baslik/zzzq%20deneme");
  await open.click();
  await expect(page).toHaveURL(/\/baslik\/zzzq%20deneme$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("zzzq deneme");
});

test("a segment that cannot be a title still renders the Turkish 404", async ({ page }) => {
  // 120 karakterlik başlık sınırının üstü: bu segment bir başlık olarak okunamaz,
  // dolayısıyla açılmamış başlık sayfası değil 404 dönüyor.
  const response = await page.goto(`/baslik/${"cok-uzun-baslik-".repeat(10)}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bu adreste bir başlık yok");
});

test("an existing title redirects to the canonical topic address", async ({ page }) => {
  // Seed'de garanti duran başlık (prisma/seed/index.ts: `topicTitles`).
  const seededTitle = "açık kaynak kültürü";
  await page.goto(`/baslik/${encodeURIComponent(seededTitle)}`);
  await expect(page).toHaveURL(/\/baslik\/acik-kaynak-kulturu--[1-9]\d*$/u, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(seededTitle);
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

test.describe("guest header call to action", () => {
  const ctaCheck = async (page: Page) => {
    const header = page.locator("body > header").first();
    const signUp = header.getByRole("link", { name: "Kayıt ol", exact: true });
    const signIn = header.getByRole("link", { name: "Giriş", exact: true });

    await expect(signUp).toBeVisible();
    await expect(signIn).toBeVisible();
    await expect(signUp).toHaveAttribute("href", "/kayit");
    await expect(signIn).toHaveAttribute("href", "/giris");

    // Dokunma hedefi: iki CTA da en az 44px yüksekliğinde.
    for (const [name, cta] of [
      ["Kayıt ol", signUp],
      ["Giriş", signIn],
    ] as const) {
      const box = await cta.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    }

    // İkinci CTA header bütçesini büyütmüyor ve gövde yatay kaymıyor.
    expect(
      await header.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(110);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  };

  test.describe("narrow", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("keeps both routes one tap away without overflowing row one", async ({ page }) => {
      await page.goto("/gundem");
      await ctaCheck(page);

      // Şerit CTA'ya rağmen dört öğesini de gösteriyor.
      const strip = page.getByRole("navigation", { name: "Ana menü" });
      await expect(strip.getByRole("link")).toHaveCount(4);

      await page
        .locator("body > header")
        .first()
        .getByRole("link", { name: "Kayıt ol", exact: true })
        .click();
      await expect(page).toHaveURL(/\/kayit$/u, { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });

  test.describe("wide", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("shows both calls to action inside the 110px header", async ({ page }) => {
      await page.goto("/son");
      await ctaCheck(page);

      await page
        .locator("body > header")
        .first()
        .getByRole("link", { name: "Giriş", exact: true })
        .click();
      await expect(page).toHaveURL(/\/giris$/u, { timeout: 20_000 });
    });
  });
});

test.describe("header search autocomplete", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("suggests topics and follows the keyboard selection", async ({ page }) => {
    await page.goto("/gundem");

    const input = page.locator("#header-search");
    const listbox = page.locator("#header-search-oneriler");
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(listbox).toBeHidden();

    await input.fill("ya");
    await expect(listbox).toBeVisible({ timeout: 20_000 });
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(listbox.getByRole("group", { name: "Başlıklar" })).toBeVisible();

    // Sanal focus: gerçek focus input'ta kalır, aktif öğe id ile işaretlenir.
    await input.press("ArrowDown");
    const activeId = await input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    await expect(input).toBeFocused();
    await expect(page.locator(`#${activeId}`)).toHaveAttribute("aria-selected", "true");

    // Esc yalnız listeyi kapatır, yazılan sorgu durur.
    await input.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(input).toHaveValue("ya");

    await input.press("ArrowDown");
    await expect(listbox).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/baslik\/[^/?]+--[1-9]\d*$/u, { timeout: 20_000 });
  });

  test("offers to open a topic when nothing matches", async ({ page }) => {
    await page.goto("/gundem");

    /*
      Hidrasyon bariyeri. `role="combobox"` yalnız `setEnhanced(true)` sonrası
      ekleniyor (search-autocomplete.tsx: "combobox anlambilimi yalnız
      hidrasyondan sonra açılır") — JS'siz sayfada input sıradan bir arama alanı.
      Beklemeden `fill()` çağırırsak React'in kontrollü girdisi henüz bağlı
      olmayabiliyor: yazı gidiyor, `query` state'i güncellenmiyor, dropdown hiç
      oluşmuyor ve hata "element not found" diye çıkıyor. Bloktaki ilk test bu
      bariyeri zaten taşıyor, bu test taşımıyordu; mobil emülasyonda hidrasyon
      daha yavaş olduğu için orada tutuyordu.
    */
    const input = page.locator("#header-search");
    await expect(input).toHaveAttribute("role", "combobox", { timeout: 20_000 });

    await input.fill("zzzq deneme");
    const option = page.getByRole("option", { name: "«zzzq deneme» başlığını aç" });
    await expect(option).toBeVisible({ timeout: 20_000 });
    await expect(option).toHaveAttribute("href", "/baslik/zzzq%20deneme");
  });
});
