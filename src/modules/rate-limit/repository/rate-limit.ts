import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export async function incrementRateLimitBucket(
  client: Client,
  input: {
    keyHash: string;
    action: string;
    windowStart: Date;
    expiresAt: Date;
  },
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_buckets"
      ("id", "keyHash", "action", "windowStart", "count", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}::uuid, ${input.keyHash}, ${input.action}, ${input.windowStart}, 1, ${input.expiresAt}, NOW(), NOW())
    ON CONFLICT ("keyHash", "action", "windowStart")
    DO UPDATE SET
      "count" = "rate_limit_buckets"."count" + 1,
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = NOW()
    RETURNING "count"
  `;
  return rows[0]?.count ?? 1;
}

/**
 * Atomically claims a strict minimum interval for an identifier/action pair.
 *
 * A single sentinel bucket is retained per pair. PostgreSQL serializes
 * concurrent `ON CONFLICT` updates, and the guarded update succeeds only when
 * the previous successful claim is old enough. Rejected attempts do not move
 * `updatedAt`, so they cannot extend the cooldown indefinitely.
 */
export async function claimRateLimitInterval(
  client: Client,
  input: {
    keyHash: string;
    action: string;
    now: Date;
    minimumIntervalMs: number;
  },
): Promise<boolean> {
  const id = randomUUID();
  const availableBefore = new Date(input.now.getTime() - input.minimumIntervalMs);
  const expiresAt = new Date(input.now.getTime() + input.minimumIntervalMs * 2);
  const sentinelWindowStart = new Date(0);
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "rate_limit_buckets"
      ("id", "keyHash", "action", "windowStart", "count", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${id}::uuid, ${input.keyHash}, ${input.action}, ${sentinelWindowStart}, 1, ${expiresAt}, ${input.now}, ${input.now})
    ON CONFLICT ("keyHash", "action", "windowStart")
    DO UPDATE SET
      "count" = "rate_limit_buckets"."count" + 1,
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "rate_limit_buckets"."updatedAt" <= ${availableBefore}
    RETURNING "id"
  `;
  return rows.length === 1;
}
