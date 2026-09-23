import { AsyncLocalStorage } from "node:async_hooks";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { refreshAuthenticationCookies } from "@/lib/auth/cookies";

interface AuthenticationCookieRenewal {
  sessionToken: string;
  csrfToken?: string;
  expiresAt: Date;
  /** Yanıt yazılmadan hemen önce: oturum hâlâ etkin mi? */
  stillValid: () => Promise<boolean>;
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

export async function applyAuthenticationCookieRenewal(response: NextResponse): Promise<void> {
  const renewal = authenticationCookieStorage.getStore()?.renewal;
  /*
    İşleyici oturum cookie'sini kendisi yazdıysa (çıkışta silme ya da şifre
    değişiminde yeni oturum, F06) yenileme onu ezmez: ezseydi iptal edilmiş eski
    token geri yazılır ve kullanıcı oturumsuz kalırdı.
  */
  const outgoingSessionCookie = response.cookies.get(SESSION_COOKIE_NAME);
  if (!renewal || outgoingSessionCookie !== undefined) return;
  /*
    İstek sürerken oturum başka bir istekte iptal edilmiş olabilir (ör. aynı
    tarayıcıda şifre değişimi yeni oturum verdi). Eski token'ı yeniden yazmak
    tarayıcının aldığı yeni cookie'yi ezerdi; oturum etkin değilse ya da
    doğrulanamazsa yenileme yapılmaz (Astra, F06).
  */
  let active = false;
  try {
    active = await renewal.stillValid();
  } catch {
    active = false;
  }
  if (active) refreshAuthenticationCookies(response, renewal);
}
