import type { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import type { IssuedSession } from "@/modules/auth/application/sessions";

export function setAuthenticationCookies(response: NextResponse, session: IssuedSession): void {
  const secure = getEnvironment().NODE_ENV === "production";
  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: session.expiresAt,
  });
  response.cookies.set(CSRF_COOKIE_NAME, session.csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    expires: session.expiresAt,
  });
}

export function setCsrfCookie(response: NextResponse, csrfToken: string, expiresAt: Date): void {
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: getEnvironment().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
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
