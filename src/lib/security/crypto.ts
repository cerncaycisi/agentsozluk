import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacIdentifier(secret: string, identifier: string): string {
  return createHmac("sha256", secret)
    .update(identifier.trim().toLocaleLowerCase("tr-TR"))
    .digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
