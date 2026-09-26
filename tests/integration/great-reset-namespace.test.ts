import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  consumeIntent,
  copyTombstones,
  GREAT_RESET_INTENT_SCOPE,
  insertCommitMarker,
  namespaceBlockers,
  namespacePostconditionsHold,
  openNewNamespace,
} from "../../src/modules/maintenance/repository/great-reset-namespace";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Namespace adımlarının gerçek PostgreSQL kanıtı. Her senaryo tek transaction'da koşar ve sonunda
  geri alınır: DDL de (kısıt değişimi, RESTART) geri döner, test veritabanı eski namespace'te kalır.
*/
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
const releaseSha = "c".repeat(40);
const receiptSha256 = "d".repeat(64);

async function inRolledBackTransaction(work: (tx: Prisma.TransactionClient) => Promise<void>) {
  await expect(
    integrationDatabase.$transaction(
      async (tx) => {
        await work(tx);
        throw rollback;
      },
      { timeout: 60_000 },
    ),
  ).rejects.toBe(rollback);
}

async function seedContent(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({
    data: {
      email: "namespace@example.test",
      emailNormalized: "namespace@example.test",
      username: "namespaceyazari",
      usernameNormalized: "namespaceyazari",
      displayName: "Namespace Yazarı",
      passwordHash: "test-hash",
      termsVersion: "test",
      termsAcceptedAt: new Date(),
    },
  });
  const topic = await tx.topic.create({
    data: {
      title: "Eski Başlık",
      normalizedTitle: "eski başlık",
      slug: "eski-baslik",
      createdById: user.id,
    },
  });
  const entry = await tx.entry.create({
    data: {
      topicId: topic.id,
      authorId: user.id,
      origin: "WEB",
      body: "Reset tarafından silinecek eski entry metni.",
      normalizedBody: "reset tarafından silinecek eski entry metni.",
    },
  });
  return { user, topic, entry };
}

async function intent(tx: Prisma.TransactionClient, operationId: string, expiresInMs = 3_600_000) {
  const createdAt = new Date();
  await tx.greatResetIntent.create({
    data: {
      operationId,
      scope: GREAT_RESET_INTENT_SCOPE,
      releaseSha,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + expiresInMs),
    },
  });
}

describe("great reset namespace adımlarının PostgreSQL sınırı", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(closeIntegrationDatabase);

  it("mezar taşını kopyalar, yeni namespace'i açar ve eski kimliğin yeniden kullanımını reddeder", () =>
    inRolledBackTransaction(async (tx) => {
      const { user, topic, entry } = await seedContent(tx);
      const operationId = randomUUID();
      const input = { operationId, releaseSha, receiptSha256 };
      expect(await namespaceBlockers(tx, input)).toEqual(["RESET_INTENT_INVALID"]);
      await intent(tx, operationId);
      expect(await namespaceBlockers(tx, input)).toEqual([]);

      await consumeIntent(tx, input);
      const counts = await copyTombstones(tx, operationId);
      expect(counts).toEqual({ topics: 1, entries: 1 });
      await tx.$executeRaw`TRUNCATE TABLE "entries", "topics" CASCADE`;
      await openNewNamespace(tx);
      const planSha256 = "e".repeat(64);
      await insertCommitMarker(tx, { ...input, planSha256, ...counts });
      expect(await namespacePostconditionsHold(tx, { ...input, planSha256, ...counts })).toBe(true);
      // Commit'in bağlayıcı alanlarından biri farklıysa son koşul düşer.
      for (const mismatch of [
        { planSha256: "f".repeat(64) },
        { releaseSha: "f".repeat(40) },
        { receiptSha256: "f".repeat(64) },
      ])
        expect(
          await namespacePostconditionsHold(tx, { ...input, planSha256, ...counts, ...mismatch }),
        ).toBe(false);

      const tombstones = await tx.greatResetTombstone.findMany({ orderBy: { kind: "asc" } });
      expect(tombstones.map((row) => [row.kind, row.contentId, Number(row.publicId)])).toEqual([
        ["TOPIC", topic.id, Number(topic.publicId)],
        ["ENTRY", entry.id, Number(entry.publicId)],
      ]);

      // Eski kimlikle açık değerli INSERT alt sınır kısıtına takılır (Astra, v17 P2).
      await tx.$executeRaw`SAVEPOINT explicit_old_id`;
      await expect(
        tx.topic.create({
          data: {
            publicId: topic.publicId,
            title: "Yeni Başlık",
            normalizedTitle: "yeni başlık",
            slug: "yeni-baslik",
            createdById: user.id,
          },
        }),
      ).rejects.toThrow(/topics_public_id_namespace_range_check/u);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT explicit_old_id`;
      const fresh = await tx.topic.create({
        data: {
          title: "Yeni Başlık",
          normalizedTitle: "yeni başlık",
          slug: "yeni-baslik",
          createdById: user.id,
        },
      });
      expect(fresh.publicId).toBe(2147483648n);
      await tx.topic.delete({ where: { id: fresh.id } });

      // Başka işlem kimliğiyle eklenmiş fazladan mezar taşı son koşulu düşürür (Astra, P2).
      await tx.greatResetTombstone.create({
        data: { kind: "ENTRY", contentId: randomUUID(), publicId: 999, operationId: randomUUID() },
      });
      expect(await namespacePostconditionsHold(tx, { ...input, planSha256, ...counts })).toBe(
        false,
      );
    }));

  it("süresi dolmuş ya da başka sürümün niyetini tüketmez", () =>
    inRolledBackTransaction(async (tx) => {
      const expired = randomUUID();
      await intent(tx, expired, 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await expect(
        consumeIntent(tx, { operationId: expired, releaseSha, receiptSha256 }),
      ).rejects.toThrow("GREAT_RESET_INTENT_INVALID");
      const other = randomUUID();
      await intent(tx, other);
      await expect(
        consumeIntent(tx, { operationId: other, releaseSha: "f".repeat(40), receiptSha256 }),
      ).rejects.toThrow("GREAT_RESET_INTENT_INVALID");
    }));

  it("commit işaretinden sonra düşen transaction bütün durumu başlangıca döndürür", async () => {
    const operationId = randomUUID();
    const state = async () => {
      const [row] = await integrationDatabase.$queryRaw<Record<string, unknown>[]>`
        SELECT
          (SELECT count(*)::int FROM topics) AS topics,
          (SELECT count(*)::int FROM entries) AS entries,
          (SELECT count(*)::int FROM great_reset_tombstones) AS tombstones,
          (SELECT count(*)::int FROM great_reset_commits) AS commits,
          (SELECT count(*)::int FROM great_reset_intents WHERE "consumedAt" IS NOT NULL) AS consumed,
          (SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint
            WHERE conname LIKE '%public_id_%range_check') AS checks,
          (SELECT string_agg(sequencename || '=' || max_value, ',' ORDER BY sequencename)
            FROM pg_sequences WHERE sequencename LIKE '%public_id_seq') AS maxima,
          (SELECT last_value::text || ':' || is_called FROM topics_public_id_seq) AS topic_seq,
          (SELECT last_value::text || ':' || is_called FROM entries_public_id_seq) AS entry_seq`;
      return row;
    };
    await integrationDatabase.$transaction(async (tx) => {
      await seedContent(tx);
      await intent(tx, operationId);
    });
    const before = await state();
    await inRolledBackTransaction(async (tx) => {
      const input = { operationId, releaseSha, receiptSha256 };
      await consumeIntent(tx, input);
      const counts = await copyTombstones(tx, operationId);
      await tx.$executeRaw`TRUNCATE TABLE "entries", "topics" CASCADE`;
      await openNewNamespace(tx);
      await insertCommitMarker(tx, { ...input, planSha256: "e".repeat(64), ...counts });
    });
    expect(await state()).toEqual(before);
    expect(before).toMatchObject({
      topics: 1,
      entries: 1,
      tombstones: 0,
      commits: 0,
      consumed: 0,
      checks: "entries_public_id_legacy_range_check,topics_public_id_legacy_range_check",
      maxima: "entries_public_id_seq=2147483647,topics_public_id_seq=2147483647",
    });
  });
});
