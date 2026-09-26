import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

/*
  Great reset 410 kapısının gerçek HTTP kanıtı (tasarım v18 madde 4): production standalone
  build'de Node runtime middleware'i, Prisma ve statik yanıt birlikte çalışır. Commit işareti
  test veritabanında bir kez yazılır; canlı içerik her durumda mezar taşından önce kazandığı
  için diğer E2E testlerinin sayfaları etkilenmez.
*/
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

    const existing = await database.greatResetCommit.findFirst();
    const operationId =
      existing?.operationId ??
      (
        await database.greatResetCommit.create({
          data: {
            operationId: randomUUID(),
            releaseSha: "e".repeat(40),
            planSha256: "e".repeat(64),
            receiptSha256: "e".repeat(64),
            topicTombstones: 0,
            entryTombstones: 0,
          },
        })
      ).operationId;

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
    const prefetch = await request.get(`/entry/${goneEntryPublicId}`, {
      headers: { "next-router-prefetch": "1" },
      maxRedirects: 0,
    });
    expect(prefetch.status()).toBe(410);

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
    // Yazma isteği kapıdan geçmez.
    expect(
      (await request.post(`/entry/${goneEntryPublicId}`, { maxRedirects: 0 })).status(),
    ).not.toBe(410);
  } finally {
    await database.$disconnect();
  }
});
