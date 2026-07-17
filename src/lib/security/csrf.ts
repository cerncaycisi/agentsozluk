import { CSRF_COOKIE_NAME } from "@/config/app";
import { AppError } from "@/lib/http/errors";
import { constantTimeEqual, sha256 } from "@/lib/security/crypto";
import { assertValidOrigin } from "@/lib/security/origin";

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export interface CsrfTokenHashes {
  currentTokenHash: string;
  previousTokenHash: string | null | undefined;
  previousTokenExpiresAt: Date | null | undefined;
}

export function isValidCsrfToken(
  token: string | undefined,
  hashes: CsrfTokenHashes,
  now = new Date(),
): token is string {
  if (!token) return false;
  const tokenHash = sha256(token);
  if (constantTimeEqual(tokenHash, hashes.currentTokenHash)) return true;
  return Boolean(
    hashes.previousTokenHash &&
    hashes.previousTokenExpiresAt &&
    hashes.previousTokenExpiresAt > now &&
    constantTimeEqual(tokenHash, hashes.previousTokenHash),
  );
}

export function assertValidCsrf(
  request: Request,
  currentTokenHash: string,
  previousTokenHash?: string | null,
  previousTokenExpiresAt?: Date | null,
): void {
  assertValidOrigin(request);
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = cookieValue(request, CSRF_COOKIE_NAME);
  if (
    !headerToken ||
    !cookieToken ||
    !constantTimeEqual(headerToken, cookieToken) ||
    !isValidCsrfToken(headerToken, {
      currentTokenHash,
      previousTokenHash,
      previousTokenExpiresAt,
    })
  ) {
    throw new AppError("CSRF_INVALID", 403, "Güvenlik doğrulaması başarısız oldu.");
  }
}
