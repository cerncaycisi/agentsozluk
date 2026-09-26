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

async function namespaceState(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<{ name: string; max: string }[]>`
    SELECT conname AS name, '' AS max FROM pg_constraint
      WHERE conname LIKE '%public_id_%range_check'
    UNION ALL
    SELECT sequencename, max_value::text FROM pg_sequences WHERE sequencename LIKE '%public_id_seq'
    ORDER BY 1`;
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
      await insertCommitMarker(tx, { ...input, planSha256: "e".repeat(64), ...counts });
      expect(await namespacePostconditionsHold(tx, { ...input, ...counts })).toBe(true);

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

  it("geri alınan reset transaction'ı eski namespace'i ve kısıtları geri getirir", async () => {
    const before = await namespaceState(integrationDatabase);
    await inRolledBackTransaction(async (tx) => {
      await tx.$executeRaw`TRUNCATE TABLE "entries", "topics" CASCADE`;
      await openNewNamespace(tx);
      expect(await namespaceState(tx)).not.toEqual(before);
    });
    expect(await namespaceState(integrationDatabase)).toEqual(before);
    expect(before.map((row) => row.name)).toEqual([
      "entries_public_id_legacy_range_check",
      "entries_public_id_seq",
      "topics_public_id_legacy_range_check",
      "topics_public_id_seq",
    ]);
    expect(before.filter((row) => row.max).map((row) => row.max)).toEqual([
      "2147483647",
      "2147483647",
    ]);
  });
});
