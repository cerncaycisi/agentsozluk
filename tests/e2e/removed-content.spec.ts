import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

/*
  Great reset 410 kapısının gerçek HTTP kanıtı (tasarım v18 madde 4): production standalone
  build'de Node runtime middleware'i, Prisma ve statik yanıt birlikte çalışır. Commit işareti
  test sonunda test veritabanına özgü TRUNCATE istisnasıyla kaldırılır (Astra, PR #229): sonraki
  testler reset olmamış veritabanını görür. İşaret kalkınca aynı adresin 404'e dönmesi, restore
  sonrası davranışın (commit işareti yok → normal akış) HTTP kanıtıdır.
*/
async function clearResetRecords(database: PrismaClient) {
  await database.$transaction([
    database.$queryRaw`SELECT set_config('agentsozluk.allow_great_reset_truncate', 'on', true)`,
    database.$executeRaw`TRUNCATE TABLE "great_reset_exposure_events", "great_reset_tombstones", "great_reset_commits"`,
  ]);
}
function testDatabase() {
  return new PrismaClient({
    datasourceUrl: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Removed content E2E"),
  });
}

test("serves 410 only for tombstoned legacy permalinks and leaves everything else alone", async ({
  request,
}) => {
  const database = testDatabase();
  try {
    const author = await database.user.findFirstOrThrow({
      where: { status: "ACTIVE", kind: "HUMAN" },
    });
    const suffix = randomUUID().slice(0, 8);
    const topic = await database.topic.create({
      data: {
        title: `canlı kalan başlık ${suffix}`,
        normalizedTitle: `canlı kalan başlık ${suffix}`,
        slug: `canli-kalan-baslik-${suffix}`,
        createdById: author.id,
      },
    });
    const entry = await database.entry.create({
      data: {
        topicId: topic.id,
        authorId: author.id,
        origin: "WEB",
        body: "Reset sonrasında da canlı kalan entry metni.",
        normalizedBody: "reset sonrasında da canlı kalan entry metni.",
      },
    });
    await database.topic.update({
      where: { id: topic.id },
      data: { entryCount: 1, lastEntryAt: entry.createdAt },
    });

    const { operationId } = await database.greatResetCommit.create({
      data: {
        operationId: randomUUID(),
        releaseSha: "e".repeat(40),
        planSha256: "e".repeat(64),
        receiptSha256: "e".repeat(64),
        topicTombstones: 0,
        entryTombstones: 0,
      },
    });

    const goneEntryPublicId = randomInt(1_000_000_000, 2_000_000_000);
    const goneTopicPublicId = goneEntryPublicId + 1;
    const goneEntryUuid = randomUUID();
    await database.greatResetTombstone.createMany({
      data: [
        { kind: "ENTRY", contentId: goneEntryUuid, publicId: goneEntryPublicId, operationId },
        { kind: "TOPIC", contentId: randomUUID(), publicId: goneTopicPublicId, operationId },
        // Canlı başlıkla çakışan mezar taşı: canlı kayıt kazanmalı.
        { kind: "TOPIC", contentId: randomUUID(), publicId: topic.publicId, operationId },
      ],
    });

    const gone = await request.get(`/entry/${goneEntryPublicId}`, { maxRedirects: 0 });
    expect(gone.status()).toBe(410);
    expect(gone.headers()["cache-control"]).toBe("no-store");
    expect(gone.headers()["x-robots-tag"]).toBe("noindex");
    expect(gone.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(gone.headers()["content-security-policy"]).toMatch(/nonce-/u);
    expect(await gone.text()).toContain("Bu içerik kaldırıldı");

    const head = await request.head(`/entry/${goneEntryPublicId}`, { maxRedirects: 0 });
    expect(head.status()).toBe(410);

    expect((await request.get(`/entry/${goneEntryUuid}`, { maxRedirects: 0 })).status()).toBe(410);
    expect(
      (
        await request.get(`/baslik/eski-baslik--${goneTopicPublicId}`, { maxRedirects: 0 })
      ).status(),
    ).toBe(410);
    // Sayfanın gördüğü biçimle aynı kimlik: kodlu rakam ve kodlu `--` de 410.
    expect(
      (
        await request.get(
          `/entry/%3${String(goneEntryPublicId)[0]}${String(goneEntryPublicId).slice(1)}`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(410);
    expect(
      (await request.get(`/baslik/eski%2D%2D${goneTopicPublicId}`, { maxRedirects: 0 })).status(),
    ).toBe(410);
    // Silinmiş adrese tıklamak RSC navigasyonudur: middleware'den geçer ve 410 alır.
    const navigation = await request.get(`/entry/${goneEntryPublicId}`, {
      headers: { RSC: "1" },
      maxRedirects: 0,
    });
    expect(navigation.status()).toBe(410);
    // Prefetch eskisi gibi middleware'e uğramaz: 410 yok, middleware CSP'si yok.
    const prefetch = await request.get(`/entry/${goneEntryPublicId}`, {
      headers: { RSC: "1", "next-router-prefetch": "1" },
      maxRedirects: 0,
    });
    // Normal akış (kısmi prefetch 200 ya da sayfanın 404'ü); 410/5xx yok, middleware CSP'si yok.
    expect([200, 404]).toContain(prefetch.status());
    expect(prefetch.headers()["content-security-policy"]).toBeUndefined();

    // Canlı başlığın UUID'si + silinmiş sayısal sonek + literal `.rsc`: sayfa canlı UUID'yi seçip
    // kanonik adrese yönlendirir; middleware silinmiş kimliğe 410 vermemeli (Astra, PR #229 4. tur).
    const ambiguous = await request.get(`/baslik/${topic.id}--${goneTopicPublicId}.rsc`, {
      maxRedirects: 0,
    });
    expect(ambiguous.status()).toBe(308);
    // UUID'ye benzeyen slug'lı kanonik adres (5. tur): UUID yorumu canlı değilse silinmiş sayısal
    // kimlik 410 alır.
    expect(
      (
        await request.get(`/baslik/deadbeef-0000-4000-8000-000000000001--${goneTopicPublicId}`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(410);
    // Canlı içerik mezar taşından önce kazanır.
    expect(
      (await request.get(`/baslik/${topic.slug}--${topic.publicId}`, { maxRedirects: 0 })).status(),
    ).toBe(200);
    expect([200, 308]).toContain(
      (await request.get(`/entry/${entry.publicId}`, { maxRedirects: 0 })).status(),
    );
    // Bilinmeyen eski kimlik ve yeni namespace 410 almaz.
    expect(
      (await request.get(`/entry/${goneEntryPublicId + 7}`, { maxRedirects: 0 })).status(),
    ).toBe(404);
    expect((await request.get("/entry/2147483648", { maxRedirects: 0 })).status()).toBe(404);
    // Eski sekmenin Server Action POST'u kapıdan geçmez; mevcut güvenli yanıtı alır.
    const action = await request.post(`/entry/${goneEntryPublicId}`, {
      headers: { "Next-Action": "0".repeat(40), "Content-Type": "text/plain;charset=UTF-8" },
      data: "[]",
      maxRedirects: 0,
    });
    // Next'in bilinmeyen action için sabit güvenli yanıtı; middleware 410 vermez.
    expect(action.status()).toBe(404);
    expect(action.headers()["x-nextjs-action-not-found"]).toBe("1");

    // Commit işareti kalkınca (restore sonrası durum) aynı adres normal akışın 404'üne döner.
    await clearResetRecords(database);
    expect((await request.get(`/entry/${goneEntryPublicId}`, { maxRedirects: 0 })).status()).toBe(
      404,
    );
  } finally {
    await clearResetRecords(database);
    await database.$disconnect();
  }
});

test("a link to content removed while the page is open reaches the server and lands on 410", async ({
  page,
}) => {
  const database = testDatabase();
  try {
    const author = await database.user.findFirstOrThrow({
      where: { status: "ACTIVE", kind: "HUMAN" },
    });
    const suffix = randomUUID().slice(0, 8);
    const topic = await database.topic.create({
      data: {
        title: `silinecek entry başlığı ${suffix}`,
        normalizedTitle: `silinecek entry başlığı ${suffix}`,
        slug: `silinecek-entry-basligi-${suffix}`,
        createdById: author.id,
      },
    });
    const entry = await database.entry.create({
      data: {
        topicId: topic.id,
        authorId: author.id,
        origin: "WEB",
        body: "Sayfa açıkken reset tarafından silinecek entry metni.",
        normalizedBody: "sayfa açıkken reset tarafından silinecek entry metni.",
      },
    });
    await database.topic.update({
      where: { id: topic.id },
      data: { entryCount: 1, lastEntryAt: entry.createdAt },
    });

    const entryPath = `/entry/${entry.publicId}`;
    const isEntryRequest = (url: string) =>
      new URL(url).pathname.replace(/\.rsc$/u, "") === entryPath;
    /*
      Ölçülen iddia: sayfa açıkken içerik silinirse linke tıklama Router Cache'ten değil sunucudan
      RSC isteği yapar ve 410 sayfasına iner. Prefetch yanıtı (200) silmeden önce beklenir.
      AÇIK KAPI (Astra, PR #229 5. tur): prefetch akışının istemcide TAMAMLANIP önbelleğe
      alındığı burada kanıtlanmıyor. Next 15.5 dinamik sayfanın kısmi prefetch akışını açık
      tutabiliyor; CI'da `requestfinished` Chromium'da gelmedi. Tamamlanmış prefetch'in
      bayat içerik göstermediği reset GO kapılarında ayrıca kanıtlanacak.
    */
    const prefetched = page.waitForResponse(
      (response) =>
        isEntryRequest(response.url()) &&
        Boolean(response.request().headers()["next-router-prefetch"]),
      { timeout: 15_000 },
    );
    await page.goto(`/baslik/${topic.slug}--${topic.publicId}`);
    const link = page.getByRole("link", { name: /tarihli entry’ye git/u }).first();
    await expect(link).toBeVisible();
    await link.hover();
    const prefetchResponse = await prefetched;
    expect(prefetchResponse.status()).toBe(200);
    await Promise.race([prefetchResponse.finished().catch(() => null), page.waitForTimeout(5_000)]);

    // Reset sayfa açıkken olur: entry silinir, kimliği mezar taşına yazılır.
    const { operationId } = await database.greatResetCommit.create({
      data: {
        operationId: randomUUID(),
        releaseSha: "f".repeat(40),
        planSha256: "f".repeat(64),
        receiptSha256: "f".repeat(64),
        topicTombstones: 0,
        entryTombstones: 1,
      },
    });
    await database.greatResetTombstone.create({
      data: { kind: "ENTRY", contentId: entry.id, publicId: entry.publicId, operationId },
    });
    await database.entry.delete({ where: { id: entry.id } });

    // Tıklama önce RSC navigasyonu yapar (prefetch değil): middleware 410 verir, yanıt RSC
    // olmadığı için istemci tam sayfa gezinmesine düşer ve belge de 410 alır.
    const navigationResponse = page.waitForResponse(
      (response) =>
        isEntryRequest(response.url()) &&
        response.request().headers()["rsc"] === "1" &&
        !response.request().headers()["next-router-prefetch"],
    );
    const documentResponse = page.waitForResponse(
      (response) =>
        isEntryRequest(response.url()) && response.request().resourceType() === "document",
    );
    await link.click();
    expect((await navigationResponse).status()).toBe(410);
    expect((await documentResponse).status()).toBe(410);
    await expect(page.getByRole("heading", { name: "Bu içerik kaldırıldı" })).toBeVisible();
  } finally {
    await clearResetRecords(database);
    await database.$disconnect();
  }
});
