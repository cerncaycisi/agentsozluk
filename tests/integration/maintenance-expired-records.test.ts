import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanupExpiredOperationalRecords } from "@/modules/maintenance";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("bounded expired operational-record cleanup", () => {
  it("deletes only bounded expired batches and is idempotent", async () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    await integrationDatabase.rateLimitBucket.createMany({
      data: [
        ...Array.from({ length: 7 }, (_, index) => ({
          keyHash: `expired-rate-${index}`,
          action: "test.cleanup",
          windowStart: new Date(now.getTime() - 200_000 - index * 1_000),
          expiresAt: new Date(now.getTime() - (100 + index) * 1_000),
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          keyHash: `future-rate-${index}`,
          action: "test.cleanup",
          windowStart: now,
          expiresAt: new Date(now.getTime() + (100 + index) * 1_000),
        })),
      ],
    });
    await integrationDatabase.idempotencyRecord.createMany({
      data: [
        ...Array.from({ length: 7 }, (_, index) => ({
          key: `expired-idempotency-${index}`,
          route: "/test/cleanup",
          requestHash: `request-${index}`,
          responseStatus: 200,
          responseBody: { ok: true },
          expiresAt: new Date(now.getTime() - (100 + index) * 1_000),
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          key: `future-idempotency-${index}`,
          route: "/test/cleanup",
          requestHash: `future-request-${index}`,
          responseStatus: 200,
          responseBody: { ok: true },
          expiresAt: new Date(now.getTime() + (100 + index) * 1_000),
        })),
      ],
    });

    await expect(
      cleanupExpiredOperationalRecords(integrationDatabase, {
        now,
        batchSize: 2,
        maxBatches: 2,
      }),
    ).resolves.toEqual({
      rateLimitBuckets: {
        beforeCount: 7,
        deletedCount: 4,
        remainingCount: 3,
        batchesRun: 2,
        oldestRemainingAgeSeconds: 102,
      },
      idempotencyRecords: {
        beforeCount: 7,
        deletedCount: 4,
        remainingCount: 3,
        batchesRun: 2,
        oldestRemainingAgeSeconds: 102,
      },
    });

    const completion = await cleanupExpiredOperationalRecords(integrationDatabase, {
      now,
      batchSize: 2,
      maxBatches: 10,
    });
    expect(completion.rateLimitBuckets).toMatchObject({
      beforeCount: 3,
      deletedCount: 3,
      remainingCount: 0,
      batchesRun: 2,
    });
    expect(completion.idempotencyRecords).toMatchObject({
      beforeCount: 3,
      deletedCount: 3,
      remainingCount: 0,
      batchesRun: 2,
    });

    const idempotent = await cleanupExpiredOperationalRecords(integrationDatabase, {
      now,
      batchSize: 2,
      maxBatches: 2,
    });
    expect(idempotent.rateLimitBuckets.deletedCount).toBe(0);
    expect(idempotent.idempotencyRecords.deletedCount).toBe(0);
    expect(await integrationDatabase.rateLimitBucket.count()).toBe(2);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(2);
  });
});
