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
