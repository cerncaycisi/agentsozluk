import type { DatabaseClient, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import {
  canonicalRequestHash,
  idempotencyExpiry,
  type JsonValue,
} from "@/modules/idempotency/domain/idempotency";
import {
  createIdempotencyRecord,
  deleteIdempotencyRecord,
  findIdempotencyRecord,
  withIdempotencyLock,
} from "@/modules/idempotency/repository/idempotency";
import { idempotencyScopeSchema } from "@/modules/idempotency/validation/schemas";

export interface IdempotentResult {
  status: number;
  body: JsonValue;
  replayed: boolean;
}

export async function executeIdempotently(
  client: DatabaseClient,
  input: {
    actorId: string;
    route: string;
    key: string;
    requestBody: unknown;
    now?: Date;
  },
  execute: (transaction: TransactionClient) => Promise<{ status: number; body: JsonValue }>,
  preflight?: (transaction: TransactionClient) => Promise<void>,
): Promise<IdempotentResult> {
  const validatedScope = idempotencyScopeSchema.safeParse(input);
  if (!validatedScope.success) {
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
    await preflight?.(transaction);
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
    const result = await execute(transaction);
    await createIdempotencyRecord(transaction, {
      actorId: input.actorId,
      route: input.route,
      key: input.key,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body,
      expiresAt: idempotencyExpiry(now),
    });
    return { ...result, replayed: false };
  });
}
