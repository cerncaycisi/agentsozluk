import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { executeIdempotently } from "@/modules/idempotency/application/idempotency";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

export { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

export async function idempotentResponse(
  request: Request,
  input: { actorId: string; route: string; requestBody: unknown },
  execute: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = request.headers.get("idempotency-key");
  if (key === null) return execute();
  const result = await executeIdempotently(getDatabase(), { ...input, key }, async () => {
    const response = await execute();
    const body = (await response.clone().json()) as JsonValue;
    return { status: response.status, body };
  });
  const response = NextResponse.json(result.body, { status: result.status });
  if (result.replayed) response.headers.set("Idempotent-Replay", "true");
  return response;
}
