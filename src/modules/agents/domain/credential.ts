import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

export function redactCreationCredential(body: JsonValue): JsonValue {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return body;
  return { ...body, data: { ...data, credential: null, credentialShownOnce: false } };
}
