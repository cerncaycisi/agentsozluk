import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { assertValidCsrf } from "@/lib/security/csrf";
import { requireSession } from "@/modules/auth/application/sessions";
import type { SessionWithUser } from "@/modules/auth/repository/sessions";

export function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function requestSession(request: NextRequest): Promise<SessionWithUser> {
  return requireSession(getDatabase(), sessionToken(request));
}

export async function csrfSession(request: NextRequest): Promise<SessionWithUser> {
  const session = await requestSession(request);
  assertValidCsrf(request, session.csrfTokenHash);
  return session;
}

export async function activeCsrfSession(request: NextRequest): Promise<SessionWithUser> {
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
