import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("authentication cookies", () => {
  it("sets production session and CSRF cookies with their distinct security flags", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { setAuthenticationCookies } = await import("@/lib/auth/cookies");
    const response = NextResponse.json({ ok: true });
    const expiresAt = new Date("2026-08-16T12:00:00.000Z");

    setAuthenticationCookies(response, {
      id: "session-id",
      token: "raw-session-token",
      csrfToken: "raw-csrf-token",
      expiresAt,
    });

    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith("ajan_session="));
    const csrf = cookies.find((cookie) => cookie.startsWith("ajan_csrf="));
    expect(session).toContain("raw-session-token");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("Secure");
    expect(session).toContain("SameSite=lax");
    expect(session).toContain("Path=/");
    expect(session).toContain("Expires=");
    expect(csrf).toContain("raw-csrf-token");
    expect(csrf).not.toContain("HttpOnly");
    expect(csrf).toContain("Secure");
  });

  it("expires both cookies when authentication is cleared", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { clearAuthenticationCookies } = await import("@/lib/auth/cookies");
    const response = NextResponse.json({ ok: true });

    clearAuthenticationCookies(response);

    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(cookie).toContain("Path=/");
    }
  });
});
