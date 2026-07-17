import type { Prisma, PrismaClient } from "@prisma/client";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

export interface StoredIdempotencyResponse {
  requestHash: string;
  responseStatus: number;
  responseBody: JsonValue;
  expiresAt: Date;
}

export function withIdempotencyLock<T>(
  client: PrismaClient,
  scope: string,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
    return work(transaction);
  });
}

export async function findIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  input: { actorId: string; route: string; key: string },
): Promise<(StoredIdempotencyResponse & { id: string }) | null> {
  const record = await transaction.idempotencyRecord.findUnique({
    where: {
      actorId_key_route: {
        actorId: input.actorId,
        route: input.route,
        key: input.key,
      },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    requestHash: record.requestHash,
    responseStatus: record.responseStatus,
    responseBody: record.responseBody as JsonValue,
    expiresAt: record.expiresAt,
  };
}

export function deleteIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<unknown> {
  return transaction.idempotencyRecord.delete({ where: { id } });
}

export function createIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  input: {
    actorId: string;
    route: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: JsonValue;
    expiresAt: Date;
  },
): Promise<unknown> {
  return transaction.idempotencyRecord.create({
    data: {
      ...input,
      responseBody: input.responseBody as Prisma.InputJsonValue,
    },
  });
}
