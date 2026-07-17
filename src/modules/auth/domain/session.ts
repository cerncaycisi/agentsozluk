import { addDays, differenceInMinutes, differenceInSeconds } from "date-fns";
import { createOpaqueToken, sha256 } from "@/lib/security/crypto";

export interface NewSessionSecrets {
  token: string;
  tokenHash: string;
  csrfToken: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export function createSessionSecrets(now = new Date(), ttlDays = 30): NewSessionSecrets {
  const token = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  return {
    token,
    tokenHash: sha256(token),
    csrfToken,
    csrfTokenHash: sha256(csrfToken),
    expiresAt: addDays(now, ttlDays),
  };
}

export function sessionUpdate(
  lastUsedAt: Date,
  expiresAt: Date,
  now = new Date(),
  ttlDays = 30,
): { lastUsedAt?: Date; expiresAt?: Date } {
  const update: { lastUsedAt?: Date; expiresAt?: Date } = {};
  if (differenceInMinutes(now, lastUsedAt) >= 15) update.lastUsedAt = now;
  if (differenceInSeconds(expiresAt, now) <= 7 * 24 * 60 * 60)
    update.expiresAt = addDays(now, ttlDays);
  return update;
}
