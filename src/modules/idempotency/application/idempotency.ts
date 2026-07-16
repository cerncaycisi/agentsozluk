import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { canonicalRequestHash, type JsonValue } from "@/modules/idempotency/domain/idempotency";
import {
  createIdempotencyRecord,
  deleteIdempotencyRecord,
  findIdempotencyRecord,
  withIdempotencyLock,
} from "@/modules/idempotency/repository/idempotency";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const validKey = /^[\x21-\x7e]{1,255}$/u;

export interface IdempotentResult {
  status: number;
  body: JsonValue;
  replayed: boolean;
}

export async function executeIdempotently(
  client: PrismaClient,
  input: {
    actorId: string;
    route: string;
    key: string;
    requestBody: unknown;
    now?: Date;
  },
  execute: () => Promise<{ status: number; body: JsonValue }>,
): Promise<IdempotentResult> {
  if (!validKey.test(input.key)) {
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Idempotency-Key 1–255 görünür ASCII karakter olmalıdır.",
      { idempotencyKey: ["Geçerli bir Idempotency-Key gönderin."] },
    );
  }
  const now = input.now ?? new Date();
  const requestHash = canonicalRequestHash(input.requestBody);
  const scope = canonicalRequestHash([input.actorId, input.route, input.key]);
  return withIdempotencyLock(client, scope, async (transaction) => {
    let record = await findIdempotencyRecord(transaction, input);
    if (record && record.expiresAt <= now) {
      await deleteIdempotencyRecord(transaction, record.id);
      record = null;
    }
    if (record) {
      if (record.requestHash !== requestHash) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Bu Idempotency-Key farklı bir istek gövdesiyle daha önce kullanıldı.",
        );
      }
      return {
        status: record.responseStatus,
        body: record.responseBody,
        replayed: true,
      };
    }
    const result = await execute();
    await createIdempotencyRecord(transaction, {
      actorId: input.actorId,
      route: input.route,
      key: input.key,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    });
    return { ...result, replayed: false };
  });
}
