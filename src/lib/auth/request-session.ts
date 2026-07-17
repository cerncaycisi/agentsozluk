import type { NextRequest } from "next/server";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { registerAuthenticationCookieRenewal } from "@/lib/auth/response-cookie-context";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { setRequestActorId } from "@/lib/logging/request-context";
import { assertValidCsrf, isValidCsrfToken } from "@/lib/security/csrf";
import {
  authenticateSession,
  requireSession,
  type AuthenticatedSession,
} from "@/modules/auth/application/sessions";

export function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

function registerCookieRenewal(
  request: NextRequest,
  rawSessionToken: string | undefined,
  session: AuthenticatedSession,
): void {
  if (!session.expiryExtended || !rawSessionToken) return;
  const csrfToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  registerAuthenticationCookieRenewal({
    sessionToken: rawSessionToken,
    ...(isValidCsrfToken(csrfToken, {
      currentTokenHash: session.csrfTokenHash,
      previousTokenHash: session.csrfPreviousTokenHash,
      previousTokenExpiresAt: session.csrfPreviousTokenExpiresAt,
    })
      ? { csrfToken }
      : {}),
    expiresAt: session.expiresAt,
  });
}

export async function optionalRequestSession(
  request: NextRequest,
): Promise<AuthenticatedSession | null> {
  const rawSessionToken = sessionToken(request);
  const session = await authenticateSession(getDatabase(), rawSessionToken);
  if (session) {
    setRequestActorId(session.userId);
    registerCookieRenewal(request, rawSessionToken, session);
  }
  return session;
}

export async function requestSession(request: NextRequest): Promise<AuthenticatedSession> {
  const rawSessionToken = sessionToken(request);
  const session = await requireSession(getDatabase(), rawSessionToken);
  setRequestActorId(session.userId);
  registerCookieRenewal(request, rawSessionToken, session);
  return session;
}

export async function csrfSession(request: NextRequest): Promise<AuthenticatedSession> {
  const session = await requestSession(request);
  assertValidCsrf(
    request,
    session.csrfTokenHash,
    session.csrfPreviousTokenHash,
    session.csrfPreviousTokenExpiresAt,
  );
  return session;
}

export async function activeCsrfSession(request: NextRequest): Promise<AuthenticatedSession> {
  const session = await csrfSession(request);
  if (session.user.status !== "ACTIVE") {
    throw new AppError(
      "ACCOUNT_SUSPENDED",
      403,
      "Hesabınız askıya alındığı için bu işlemi yapamazsınız.",
    );
  }
  return session;
}
