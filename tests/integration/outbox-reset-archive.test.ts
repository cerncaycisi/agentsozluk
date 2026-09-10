import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  archivePendingOutboxEvents,
  assertExpectedOutboxArchive,
  outboxArchivesAreValid,
  pendingOutboxSnapshot,
  outboxArchiveSummary,
} from "../../src/modules/maintenance/repository/outbox-reset-archive";
import { findPendingOutboxEvents } from "../../src/modules/outbox/repository/pending";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const planSha256 = "a".repeat(64);
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
async function fixture(work: (tx: Prisma.TransactionClient) => Promise<void>) {
  await expect(
    integrationDatabase.$transaction(async (tx) => {
      await work(tx);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
async function event(tx: Prisma.TransactionClient, processedAt: Date | null = null) {
  return tx.outboxEvent.create({
    data: {
      eventType: "entry.created",
      aggregateType: "Entry",
      aggregateId: randomUUID(),
      requestId: randomUUID(),
      payload: { synthetic: true },
      processedAt,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    },
  });
}

describe("reset outbox arşivinin gerçek PostgreSQL sınırı", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(closeIntegrationDatabase);

  it("boş kümede arşiv üretmez", async () =>
    fixture(async (tx) => {
      const snapshot = await pendingOutboxSnapshot(tx);
      expect(snapshot.rows).toBe(0);
      expect(await archivePendingOutboxEvents(tx, randomUUID(), planSha256, snapshot)).toBeNull();
      expect(await tx.outboxResetArchive.count()).toBe(0);
      expect(await outboxArchivesAreValid(tx)).toBe(true);
    }));

  it("satırları değiştirmeden tam üyelik kurar; yeni ve geriye tarihli olay tüketilebilir", async () =>
    fixture(async (tx) => {
      await event(tx);
      await event(tx);
      await event(tx, new Date());
      const before = await tx.outboxEvent.findMany({ orderBy: { id: "asc" } });
      const snapshot = await pendingOutboxSnapshot(tx);
      expect(snapshot.rows).toBe(2);
      const id = randomUUID();
      expect(await archivePendingOutboxEvents(tx, id, planSha256, snapshot)).toBe(id);
      expect(await tx.outboxEvent.findMany({ orderBy: { id: "asc" } })).toEqual(before);
      expect(await tx.outboxResetArchiveEvent.count()).toBe(2);
      expect(await outboxArchiveSummary(tx)).toEqual({
        archiveGenerations: 1,
        totalArchivedUndeliveredRows: 2,
      });
      expect(await pendingOutboxSnapshot(tx)).toMatchObject({ rows: 0 });
      expect(await outboxArchivesAreValid(tx)).toBe(true);
      expect(await findPendingOutboxEvents(tx, 10)).toEqual([]);
      // Eski processedAt-only okuma arşivi görür; consumer sözleşmesi bunu ayırır.
      expect(await tx.outboxEvent.count({ where: { processedAt: null } })).toBe(2);
      const fresh = await event(tx);
      expect((await findPendingOutboxEvents(tx, 10)).map((row) => row.id)).toEqual([fresh.id]);
      await tx.outboxEvent.update({ where: { id: fresh.id }, data: { processedAt: new Date() } });
      expect(await findPendingOutboxEvents(tx, 10)).toEqual([]);
    }));

  it("yanlış küme özeti kabul edilmez ve transaction kalıcı arşiv bırakmaz", async () => {
    await fixture(async (tx) => {
      await event(tx);
      const snapshot = await pendingOutboxSnapshot(tx);
      await expect(
        archivePendingOutboxEvents(tx, randomUUID(), planSha256, {
          ...snapshot,
          sha256: "0".repeat(64),
        }),
      ).rejects.toThrow("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
    });
    expect(await integrationDatabase.outboxEvent.count()).toBe(0);
    expect(await integrationDatabase.outboxResetArchive.count()).toBe(0);
  });

  it("üyeleri eksik manifest doğrulanmış sayılmaz", async () =>
    fixture(async (tx) => {
      await tx.outboxResetArchive.create({
        data: { id: randomUUID(), planSha256, eventCount: 1, eventsSha256: "0".repeat(64) },
      });
      expect(await outboxArchivesAreValid(tx)).toBe(false);
    }));

  // Fixture bütün arşivlerini rollback ediyor; temizlik hiç COMMIT edilmiş arşivle
  // sınanmamıştı. Başlık tablosu TRUNCATE listesinde yoksa `eventCount > 0` başlıklar
  // kalır ve sonraki testin başlangıç durumu bozulur.
  it("temizlik commit edilmiş arşivi başlığıyla birlikte siler", async () => {
    await integrationDatabase.$transaction(async (tx) => {
      await event(tx);
      const snapshot = await pendingOutboxSnapshot(tx);
      await archivePendingOutboxEvents(tx, randomUUID(), planSha256, snapshot);
    });
    expect(await integrationDatabase.outboxResetArchive.count()).toBe(1);
    expect(await integrationDatabase.outboxResetArchiveEvent.count()).toBe(1);

    await resetIntegrationDatabase();

    expect(await integrationDatabase.outboxEvent.count()).toBe(0);
    expect(await integrationDatabase.outboxResetArchiveEvent.count()).toBe(0);
    expect(await integrationDatabase.outboxResetArchive.count()).toBe(0);
    expect(await outboxArchivesAreValid(integrationDatabase)).toBe(true);
  });

  it("arşiv özeti oturum saat dilimi değişince aynı kalır", async () =>
    fixture(async (tx) => {
      await event(tx);
      await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
      const utc = await pendingOutboxSnapshot(tx);
      await tx.$executeRaw`SET LOCAL timezone = 'America/New_York'`;
      expect(await pendingOutboxSnapshot(tx)).toEqual(utc);
      await archivePendingOutboxEvents(tx, randomUUID(), planSha256, utc);
      await tx.$executeRaw`SET LOCAL timezone = 'Europe/Istanbul'`;
      expect(await outboxArchivesAreValid(tx)).toBe(true);
    }));

  it("başka planın veya eksik arşivin makbuzunu reddeder", async () =>
    fixture(async (tx) => {
      await event(tx);
      const snapshot = await pendingOutboxSnapshot(tx);
      const id = randomUUID();
      await archivePendingOutboxEvents(tx, id, planSha256, snapshot);
      await expect(assertExpectedOutboxArchive(tx, id, "b".repeat(64), snapshot)).rejects.toThrow(
        "GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH",
      );
      await expect(
        assertExpectedOutboxArchive(tx, randomUUID(), planSha256, snapshot),
      ).rejects.toThrow("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
    }));

  it.each(["process", "delete-event", "update-manifest", "delete-membership", "truncate"] as const)(
    "%s ile eski olay veya üyelik kaybolamaz",
    async (operation) =>
      fixture(async (tx) => {
        await event(tx);
        await archivePendingOutboxEvents(
          tx,
          randomUUID(),
          planSha256,
          await pendingOutboxSnapshot(tx),
        );
        const write =
          operation === "process"
            ? tx.$executeRaw`UPDATE outbox_events SET "processedAt"=now()`
            : operation === "delete-event"
              ? tx.$executeRaw`DELETE FROM outbox_events`
              : operation === "update-manifest"
                ? tx.$executeRaw`UPDATE outbox_reset_archives SET "eventCount"=1`
                : operation === "delete-membership"
                  ? tx.$executeRaw`DELETE FROM outbox_reset_archive_events`
                  : tx.$executeRaw`TRUNCATE outbox_events CASCADE`;
        await expect(write).rejects.toMatchObject({ code: "P2010", meta: { code: "55000" } });
      }),
  );

  it("tüketici sorgusunun sınırsız veya geçersiz boyutunu reddeder", async () =>
    fixture(async (tx) => {
      for (const limit of [0, -1, 1001, 1.5, NaN])
        expect(() => findPendingOutboxEvents(tx, limit)).toThrow("OUTBOX_INVALID_LIMIT");
    }));
});
