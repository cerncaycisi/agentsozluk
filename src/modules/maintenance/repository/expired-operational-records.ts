import { Prisma, type PrismaClient } from "@prisma/client";
import {
  oldestExpiredAgeSeconds,
  type ExpiredOperationalRecordTelemetry,
  type ExpiredRecordCleanupOptions,
  type ExpiredRecordTableTelemetry,
} from "@/modules/maintenance/domain/expired-operational-records";

interface ExpiredAggregate {
  count: number;
  oldest: Date | null;
}

interface ExpiredRow {
  expiresAt: Date;
}

async function cleanupTable(
  transaction: Prisma.TransactionClient,
  input: ExpiredRecordCleanupOptions & {
    aggregate: () => Promise<ExpiredAggregate>;
    deleteBatch: () => Promise<ExpiredRow[]>;
  },
): Promise<ExpiredRecordTableTelemetry> {
  const before = await input.aggregate();
  let deletedCount = 0;
  let batchesRun = 0;
  for (let index = 0; index < input.maxBatches; index += 1) {
    const deleted = await input.deleteBatch();
    if (deleted.length === 0) break;
    deletedCount += deleted.length;
    batchesRun += 1;
    if (deleted.length < input.batchSize) break;
  }
  const after = await input.aggregate();
  return {
    beforeCount: before.count,
    deletedCount,
    remainingCount: after.count,
    batchesRun,
    oldestRemainingAgeSeconds: oldestExpiredAgeSeconds(input.now, after.oldest),
  };
}

export function deleteExpiredOperationalRecordBatches(
  database: PrismaClient,
  input: ExpiredRecordCleanupOptions,
): Promise<ExpiredOperationalRecordTelemetry> {
  return database.$transaction(async (transaction) => {
    const rateLimitBuckets = await cleanupTable(transaction, {
      ...input,
      aggregate: async () => {
        const [result] = await transaction.$queryRaw<ExpiredAggregate[]>(Prisma.sql`
          SELECT
            count(*)::integer AS "count",
            min("expiresAt") AS "oldest"
          FROM rate_limit_buckets
          WHERE "expiresAt" < ${input.now}
        `);
        return result ?? { count: 0, oldest: null };
      },
      deleteBatch: () =>
        transaction.$queryRaw<ExpiredRow[]>(Prisma.sql`
          WITH candidates AS (
            SELECT id
            FROM rate_limit_buckets
            WHERE "expiresAt" < ${input.now}
            ORDER BY "expiresAt" ASC, id ASC
            LIMIT ${input.batchSize}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM rate_limit_buckets AS target
          USING candidates
          WHERE target.id = candidates.id
          RETURNING target."expiresAt" AS "expiresAt"
        `),
    });
    const idempotencyRecords = await cleanupTable(transaction, {
      ...input,
      aggregate: async () => {
        const [result] = await transaction.$queryRaw<ExpiredAggregate[]>(Prisma.sql`
          SELECT
            count(*)::integer AS "count",
            min("expiresAt") AS "oldest"
          FROM idempotency_records
          WHERE "expiresAt" < ${input.now}
        `);
        return result ?? { count: 0, oldest: null };
      },
      deleteBatch: () =>
        transaction.$queryRaw<ExpiredRow[]>(Prisma.sql`
          WITH candidates AS (
            SELECT id
            FROM idempotency_records
            WHERE "expiresAt" < ${input.now}
            ORDER BY "expiresAt" ASC, id ASC
            LIMIT ${input.batchSize}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM idempotency_records AS target
          USING candidates
          WHERE target.id = candidates.id
          RETURNING target."expiresAt" AS "expiresAt"
        `),
    });
    return { rateLimitBuckets, idempotencyRecords };
  });
}
