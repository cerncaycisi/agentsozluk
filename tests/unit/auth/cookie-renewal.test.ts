import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import {
  applyAuthenticationCookieRenewal,
  registerAuthenticationCookieRenewal,
  withAuthenticationCookieContext,
} from "@/lib/auth/response-cookie-context";

/*
  F06: şifre değişimi yeni oturum verir. İstek sırasında eski oturumun süresi
  kaydıysa, yanıt sonrası yenileme iptal edilmiş eski token'ı yeni cookie'nin
  üstüne yazmamalı — ne aynı yanıtta ne de uçuştaki başka bir istekte.
*/
describe("oturum cookie yenilemesi", () => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const eski = { sessionToken: "eski-token", csrfToken: "eski-csrf", expiresAt };

  async function yanit(
    stillValid: () => Promise<boolean>,
    isleyici: (yanit: NextResponse) => void = () => {},
  ) {
    return withAuthenticationCookieContext(async () => {
      registerAuthenticationCookieRenewal({ ...eski, stillValid });
      const outgoing = NextResponse.json({ ok: true });
      isleyici(outgoing);
      await applyAuthenticationCookieRenewal(outgoing);
      return outgoing;
    });
  }

  it("işleyicinin yazdığı yeni oturum ve CSRF cookie'lerini ezmez", async () => {
    const response = await yanit(
      async () => true,
      (outgoing) =>
        setAuthenticationCookies(outgoing, {
          id: "yeni",
          token: "yeni-token",
          csrfToken: "yeni-csrf",
          expiresAt,
        }),
    );
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("yeni-token");
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe("yeni-csrf");
  });

  it("oturum hâlâ etkinse ve işleyici cookie yazmadıysa kayan süreyi yeniler", async () => {
    const response = await yanit(async () => true);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("eski-token");
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe("eski-csrf");
  });

  it("oturum istek sürerken iptal edildiyse eski token'ı yeniden yazmaz", async () => {
    // Aynı tarayıcıda başka bir istek (şifre değişimi) yeni oturum verdi; bu
    // yanıt sonra gelse de tarayıcının yeni cookie'sine dokunmamalı.
    const response = await yanit(async () => false);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
    expect(response.cookies.get(CSRF_COOKIE_NAME)).toBeUndefined();
  });

  it("oturum durumu doğrulanamazsa yenileme yapılmaz", async () => {
    const response = await yanit(async () => {
      throw new Error("veritabanı yok");
    });
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
