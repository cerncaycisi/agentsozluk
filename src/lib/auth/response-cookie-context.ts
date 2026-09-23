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
  /*
    İşleyici oturum cookie'sini kendisi yazdıysa (çıkışta silme ya da şifre
    değişiminde yeni oturum, F06) yenileme onu ezmez: ezseydi iptal edilmiş eski
    token geri yazılır ve kullanıcı oturumsuz kalırdı.
  */
  const outgoingSessionCookie = response.cookies.get(SESSION_COOKIE_NAME);
  if (renewal && outgoingSessionCookie === undefined) {
    refreshAuthenticationCookies(response, renewal);
  }
}
