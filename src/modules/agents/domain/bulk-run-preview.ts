import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { constantTimeEqual, hmacToken } from "@/lib/security/crypto";

export const BULK_RUN_PREVIEW_TTL_MS = 10 * 60 * 1000;
export const BULK_RUN_PREVIEW_TOKEN_PATTERN =
  /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9]{13}\.[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/u;

function signature(secret: string, actorId: string, payload: string): string {
  return hmacToken(secret, `agent-bulk-run-preview:${actorId}:${payload}`);
}

export function issueBulkRunPreview(secret: string, actorId: string, stateHash: string, now: Date) {
  const previewId = randomUUID();
  const payload = `v1.${previewId}.${now.getTime()}.${stateHash}`;
  return {
    previewId,
    previewToken: `${payload}.${signature(secret, actorId, payload)}`,
    previewExpiresAt: new Date(now.getTime() + BULK_RUN_PREVIEW_TTL_MS),
  };
}

export function verifyBulkRunPreview(secret: string, actorId: string, token: string, now: Date) {
  if (!BULK_RUN_PREVIEW_TOKEN_PATTERN.test(token))
    throw new AppError("BULK_PREVIEW_INVALID", 409, "Önizleme geçersiz; yeniden önizleyin.");
  const [version, id, issued, stateHash, suppliedSignature] = token.split(".") as [
    string,
    string,
    string,
    string,
    string,
  ];
  const payload = `${version}.${id}.${issued}.${stateHash}`;
  if (!constantTimeEqual(suppliedSignature, signature(secret, actorId, payload)))
    throw new AppError("BULK_PREVIEW_INVALID", 409, "Önizleme geçersiz; yeniden önizleyin.");
  const age = now.getTime() - Number(issued);
  if (age < 0 || age >= BULK_RUN_PREVIEW_TTL_MS)
    throw new AppError("BULK_PREVIEW_EXPIRED", 409, "Önizlemenin süresi doldu; yeniden önizleyin.");
  return { id, stateHash };
}

export function bulkPreviewRunKey(previewId: string, agentProfileId: string): string {
  return `bulk-preview:${previewId}:${agentProfileId}`;
}
