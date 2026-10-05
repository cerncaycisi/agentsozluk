import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

const operationId = "00000000-0000-4000-8000-00000000a410";
const removedTopic = "00000000-0000-4000-8000-00000000a411";
const removedEntry = "00000000-0000-4000-8000-00000000a412";
const normalizedTitle = "reset sınır fixture";

// Kalıcı immutable fixture yalnız her E2E koşusunda sıfırdan kurulmuş allowlisted test DB'dedir.
// DELETE/TRUNCATE istisnası veya trigger kapatma yok; ikinci tarayıcı projesi aynı fixture'ı okur.
test("known removed numeric/UUID links are 410, live links win and unknown links stay 404", async ({
  request,
  page,
}) => {
  const database = new PrismaClient({
    datasourceUrl: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Reset boundary E2E"),
  });
  try {
    if (!(await database.greatResetCommit.findUnique({ where: { operationId } }))) {
      expect(await database.greatResetCommit.count()).toBe(0);
      expect((await request.get("/entry/777777001")).status()).toBe(404);
      const author = await database.user.findFirstOrThrow({
        where: { kind: "HUMAN", status: "ACTIVE" },
        select: { id: true },
      });
      await database.$transaction(
        async (tx) => {
          const topic = await tx.topic.create({
            data: {
              title: normalizedTitle,
              normalizedTitle,
              slug: "reset-sinir-fixture",
              createdById: author.id,
              entries: {
                create: {
                  authorId: author.id,
                  origin: "WEB",
                  body: "Canlı içerik reset mezar taşından önce kazanır.",
                  normalizedBody: "canlı içerik",
                },
              },
            },
            include: { entries: true },
          });
          await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation', ${operationId}, true)`;
          const now = new Date();
          await tx.greatResetIntent.create({
            data: {
              operationId,
              createdAt: now,
              expiresAt: new Date(now.getTime() + 60 * 60_000),
              releaseSha: "a".repeat(40),
              scope: "ALL_DICTIONARY_AND_AGENT_STATE_KEEP_IDENTITIES_V1",
              sourceDatabaseOid: 1n,
              sourceClusterId: "1",
            },
          });
          await tx.greatResetIntent.update({
            where: { operationId },
            data: { consumedAt: new Date() },
          });
          await tx.greatResetTombstone.createMany({
            data: [
              { kind: "TOPIC", uuid: removedTopic, publicId: 777777001n, operationId },
              { kind: "ENTRY", uuid: removedEntry, publicId: 777777001n, operationId },
              { kind: "TOPIC", uuid: topic.id, publicId: topic.publicId, operationId },
              {
                kind: "ENTRY",
                uuid: topic.entries[0]!.id,
                publicId: topic.entries[0]!.publicId,
                operationId,
              },
            ],
          });
          await tx.greatResetCommit.create({
            data: {
              operationId,
              releaseSha: "a".repeat(40),
              manifestSha256: "1".repeat(64),
              planSha256: "2".repeat(64),
              protectedSha256: "3".repeat(64),
              clearedCounts: { topics: 2, entries: 2 },
            },
          });
        },
        { timeout: 15000 },
      );
    }
    // Negatif process cache en çok250ms; gerçek reset/restore bütün app süreçlerini yeniden açar.
    await expect
      .poll(async () => (await request.get("/entry/777777001")).status(), { timeout: 5000 })
      .toBe(410);
    for (const path of [
      "/entry/777777001",
      `/entry/${removedEntry}`,
      "/baslik/silinen--777777001",
      `/baslik/${removedTopic}-silinen`,
    ]) {
      for (const headers of [
        {},
        { "next-router-prefetch": "1" },
        { purpose: "prefetch" },
        { RSC: "1" },
      ]) {
        const response = await request.get(path, { headers });
        expect(response.status()).toBe(410);
        expect(response.headers()["cache-control"]).toBe("no-store");
        expect(response.headers()["x-robots-tag"]).toBe("noindex");
        expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
        expect(await response.text()).toContain("İçerik kaldırıldı");
      }
      const head = await request.head(path);
      expect(head.status()).toBe(410);
      expect(await head.body()).toHaveLength(0);
    }
    expect((await request.get("/entry/777777002")).status()).toBe(404);
    expect((await request.get(`/entry/${randomUUID()}`)).status()).toBe(404);
    expect((await request.get("/entry/2147483648")).status()).toBe(404);
    expect((await request.post("/entry/777777001", { data: {} })).status()).not.toBe(410);
    const live = await database.topic.findUniqueOrThrow({
      where: { normalizedTitle },
      include: { entries: true },
    });
    expect((await request.get(`/entry/${live.entries[0]!.publicId}`)).status()).toBe(200);
    expect((await request.get(`/baslik/${live.slug}--${live.publicId}`)).status()).toBe(200);
    const redirect = await request.get(`/baslik/${live.id}-eski`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toContain(`${live.slug}--${live.publicId}`);
    await page.goto(`/entry/${live.entries[0]!.publicId}`);
    await expect(page.locator("main")).toContainText(
      "Canlı içerik reset mezar taşından önce kazanır.",
    );
    const unopened = await request.get("/baslik/%C3%A7ok%20yeni%20a%C3%A7%C4%B1lmam%C4%B1%C5%9F");
    expect(unopened.status()).toBe(200);
    expect(await unopened.text()).toContain("noindex");
  } finally {
    await database.$disconnect();
  }
});
