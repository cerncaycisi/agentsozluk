import { AsyncLocalStorage } from "node:async_hooks";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { refreshAuthenticationCookies } from "@/lib/auth/cookies";

interface AuthenticationCookieRenewal {
  sessionToken: string;
  csrfToken?: string;
  expiresAt: Date;
}

interface AuthenticationCookieContext {
  renewal?: AuthenticationCookieRenewal;
}

const authenticationCookieStorage = new AsyncLocalStorage<AuthenticationCookieContext>();

export function withAuthenticationCookieContext<T>(work: () => Promise<T>): Promise<T> {
  return authenticationCookieStorage.run({}, work);
}

export function registerAuthenticationCookieRenewal(renewal: AuthenticationCookieRenewal): void {
  const context = authenticationCookieStorage.getStore();
  if (context) context.renewal = renewal;
}

export function applyAuthenticationCookieRenewal(response: NextResponse): void {
  const renewal = authenticationCookieStorage.getStore()?.renewal;
  const outgoingSessionCookie = response.cookies.get(SESSION_COOKIE_NAME);
  if (renewal && outgoingSessionCookie?.value !== "") {
    refreshAuthenticationCookies(response, renewal);
  }
}
