import { expect, test } from "@playwright/test";

/*
  GA4 ölçüm sondası (29 Eylül 2026). GA4'e 23 Eylül'den beri olay düşmüyor.
  Soru: "Kabul et" diyen gerçek bir ziyaretçide GTM → Google etiketi → GA4
  `collect` zinciri çalışıyor mu? Olay geliyorsa sorun kod değil onay oranıdır;
  gelmiyorsa hangi halkada koptuğu aşağıdaki tanıdan okunur.

  Kapsam: yalnız herkese açık ana sayfa ve bir başlık listesi; hesap açmaz, giriş
  yapmaz, form göndermez. Aynı köke yalnız GET/HEAD geçer. Google ve Hotjar
  istekleri GEÇER (gerçek bir GA4 oturumu oluşur); başka üçüncü taraf engellenir.
*/

const SITE = "https://agentsozluk.com";
const OLCUM =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|google\.com|hotjar\.com|hotjar\.io)$/u;

test.use({ serviceWorkers: "block" });

test("kabul sonrası GA4 collect isteği gider", async ({ context, page }) => {
  const istekler: string[] = [];
  const engellenen: string[] = [];
  const konsol: string[] = [];

  await context.route("**/*", async (route) => {
    const istek = route.request();
    const url = new URL(istek.url());
    const ayniKok = url.origin === SITE && ["GET", "HEAD"].includes(istek.method());
    if (ayniKok || OLCUM.test(url.hostname)) {
      await route.continue();
      return;
    }
    engellenen.push(`${istek.method()} ${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (olay) => {
      const w = window as unknown as { __csp?: string[] };
      (w.__csp ??= []).push(`${olay.violatedDirective} ${olay.blockedURI || "inline"}`);
    });
  });
  page.on("console", (mesaj) => {
    if (["error", "warning"].includes(mesaj.type()))
      konsol.push(`${mesaj.type()}: ${mesaj.text().slice(0, 200)}`);
  });
  page.on("response", (yanit) => {
    const url = new URL(yanit.url());
    if (!OLCUM.test(url.hostname)) return;
    // Sorgu değerleri yazılmaz; yalnız olay adı (en) ve ölçüm kimliği (tid) tanıya girer.
    const en = url.searchParams.get("en");
    const tid = url.searchParams.get("tid") ?? url.searchParams.get("id");
    istekler.push(
      `${yanit.request().method()} ${yanit.status()} ${url.hostname}${url.pathname}` +
        `${tid ? ` id=${tid}` : ""}${en ? ` en=${en}` : ""}`,
    );
  });
  page.on("requestfailed", (istek) => {
    const url = new URL(istek.url());
    if (OLCUM.test(url.hostname))
      istekler.push(`FAILED ${istek.failure()?.errorText} ${url.hostname}${url.pathname}`);
  });

  await page.goto("/");
  const serit = page.getByRole("region", { name: "Çerez tercihi" });
  await expect(serit).toBeVisible();
  await serit.getByRole("button", { name: "Kabul et" }).click();

  const collect = () => istekler.filter((satir) => /\/g\/collect/u.test(satir));
  await expect
    .poll(collect, { timeout: 30_000 })
    .not.toHaveLength(0)
    .catch(() => undefined);
  // Onaylı ikinci sayfa görüntülemesi (tam yükleme).
  await page.goto("/basliklar").catch(() => undefined);
  await page.waitForTimeout(8_000);

  const durum = await page.evaluate(() => {
    const w = window as unknown as {
      __csp?: string[];
      dataLayer?: Record<string, unknown>[];
      google_tag_manager?: Record<string, unknown>;
    };
    return {
      gtmEtiketi: Boolean(document.getElementById("google-tag-manager")),
      hotjarEtiketi: Boolean(document.getElementById("hotjar-tracking")),
      gtmJs: [...document.scripts].some((s) => s.src.includes("gtm.js")),
      gtagJs: [...document.scripts].some((s) => s.src.includes("gtag/js")),
      dataLayerOlaylari: (w.dataLayer ?? []).map((e) => String(e.event ?? "?")).slice(0, 20),
      gtmNesnesi: Object.keys(w.google_tag_manager ?? {}),
      cspIhlalleri: w.__csp ?? [],
      cerezler: document.cookie.split(";").map((c) => c.trim().split("=")[0]),
    };
  });
  const tani = { durum, istekler, engellenen, konsol };
  // Tanı Actions günlüğüne yazılır; değer içermez (yalnız host/yol, olay adı, kimlik).
  process.stdout.write(`GA4_SONDA ${JSON.stringify(tani, null, 1)}\n`);
  expect(collect(), "GA4 collect isteği gitmeli").not.toHaveLength(0);
});
