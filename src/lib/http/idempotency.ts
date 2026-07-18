import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { executeIdempotently } from "@/modules/idempotency/application/idempotency";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

export { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

export async function idempotentResponse(
  request: Request,
  input: { actorId: string; route: string; requestBody: unknown },
  execute: (client: DatabaseExecutor) => Promise<NextResponse>,
  preflight?: (client: DatabaseExecutor) => Promise<void>,
  storedBodyTransform?: (body: JsonValue) => JsonValue,
  replayedBodyTransform?: (body: JsonValue) => JsonValue,
): Promise<NextResponse> {
  const database = getDatabase();
  const key = request.headers.get("idempotency-key");
  if (key === null) {
    await preflight?.(database);
    return execute(database);
  }
  const result = await executeIdempotently(
    database,
    { ...input, key },
    async (transaction) => {
      const response = await execute(transaction);
      const body = (await response.clone().json()) as JsonValue;
      return {
        status: response.status,
        body,
        ...(storedBodyTransform ? { storedBody: storedBodyTransform(body) } : {}),
      };
    },
    preflight,
  );
  const responseBody =
    result.replayed && replayedBodyTransform ? replayedBodyTransform(result.body) : result.body;
  const response = NextResponse.json(responseBody, { status: result.status });
  if (result.replayed) response.headers.set("Idempotent-Replay", "true");
  return response;
}
