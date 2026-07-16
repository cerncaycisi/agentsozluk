import { CSRF_COOKIE_NAME } from "@/config/app";
import { AppError } from "@/lib/http/errors";
import { constantTimeEqual, sha256 } from "@/lib/security/crypto";
import { assertValidOrigin } from "@/lib/security/origin";

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function assertValidCsrf(request: Request, csrfTokenHash: string): void {
  assertValidOrigin(request);
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = cookieValue(request, CSRF_COOKIE_NAME);
  if (
    !headerToken ||
    !cookieToken ||
    !constantTimeEqual(headerToken, cookieToken) ||
    !constantTimeEqual(sha256(headerToken), csrfTokenHash)
  ) {
    throw new AppError("CSRF_INVALID", 403, "Güvenlik doğrulaması başarısız oldu.");
  }
}
