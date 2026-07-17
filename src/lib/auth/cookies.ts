import type { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import type { IssuedSession } from "@/modules/auth/application/sessions";

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnvironment().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

function csrfCookieOptions(expiresAt: Date) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: getEnvironment().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function setAuthenticationCookies(response: NextResponse, session: IssuedSession): void {
  response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));
  response.cookies.set(CSRF_COOKIE_NAME, session.csrfToken, csrfCookieOptions(session.expiresAt));
}

export function setCsrfCookie(response: NextResponse, csrfToken: string, expiresAt: Date): void {
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions(expiresAt));
}

export function refreshAuthenticationCookies(
  response: NextResponse,
  input: { sessionToken: string; csrfToken?: string; expiresAt: Date },
): void {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    input.sessionToken,
    sessionCookieOptions(input.expiresAt),
  );
  if (input.csrfToken) {
    response.cookies.set(CSRF_COOKIE_NAME, input.csrfToken, csrfCookieOptions(input.expiresAt));
  }
}

export function clearAuthenticationCookies(response: NextResponse): void {
  const secure = getEnvironment().NODE_ENV === "production";
  for (const name of [SESSION_COOKIE_NAME, CSRF_COOKIE_NAME]) {
    response.cookies.set(name, "", {
      httpOnly: name === SESSION_COOKIE_NAME,
      sameSite: "lax",
      secure,
      path: "/",
      expires: new Date(0),
    });
  }
}
