import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import {
  applyAuthenticationCookieRenewal,
  registerAuthenticationCookieRenewal,
  withAuthenticationCookieContext,
} from "@/lib/auth/response-cookie-context";

/*
  F06: şifre değişimi yeni oturum verir. İstek sırasında eski oturumun süresi
  kaydıysa, yanıt sonrası yenileme iptal edilmiş eski token'ı yeni cookie'nin
  üstüne yazmamalı.
*/
describe("oturum cookie yenilemesi", () => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it("işleyicinin yazdığı yeni oturum cookie'sini ezmez", async () => {
    const response = await withAuthenticationCookieContext(async () => {
      registerAuthenticationCookieRenewal({ sessionToken: "eski-token", expiresAt });
      const outgoing = NextResponse.json({ ok: true });
      setAuthenticationCookies(outgoing, {
        id: "yeni",
        token: "yeni-token",
        csrfToken: "yeni-csrf",
        expiresAt,
      });
      applyAuthenticationCookieRenewal(outgoing);
      return outgoing;
    });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("yeni-token");
  });

  it("işleyici cookie yazmadıysa kayan süreyi yeniler", async () => {
    const response = await withAuthenticationCookieContext(async () => {
      registerAuthenticationCookieRenewal({ sessionToken: "eski-token", expiresAt });
      const outgoing = NextResponse.json({ ok: true });
      applyAuthenticationCookieRenewal(outgoing);
      return outgoing;
    });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("eski-token");
  });
});
