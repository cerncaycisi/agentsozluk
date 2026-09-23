import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";

const mocks = vi.hoisted(() => ({
  csrfSession: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/lib/auth/request-session", () => ({ csrfSession: mocks.csrfSession }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/auth/application/accounts", () => ({
  changePassword: mocks.changePassword,
}));

/*
  F06: şifre değişimi yanıtı yeni oturum ve CSRF cookie'lerini taşır; istek
  oturum süresini uzatmaz (uzatsaydı eşzamanlı ikinci isteğin yanıtı eski
  token'ı geri yazabilirdi).
*/
describe("POST /api/v1/me/password (F06)", () => {
  beforeEach(() => {
    mocks.csrfSession.mockReset();
    mocks.changePassword.mockReset();
  });

  it("yeni oturum ve CSRF cookie'lerini yazar, süre uzatmadan oturum alır", async () => {
    mocks.csrfSession.mockResolvedValue({ id: "eski-oturum", userId: "kullanici" });
    const expiresAt = new Date(Date.now() + 86_400_000);
    mocks.changePassword.mockResolvedValue({
      id: "yeni-oturum",
      token: "yeni-token",
      csrfToken: "yeni-csrf",
      expiresAt,
    });
    const { POST } = await import("@/app/api/v1/me/password/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/me/password", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "test-agent" },
        body: JSON.stringify({
          currentPassword: "EskiSifre123!",
          newPassword: "YeniSifre456!x",
          newPasswordConfirmation: "YeniSifre456!x",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.csrfSession).toHaveBeenCalledWith(expect.anything(), {
      extendExpiration: false,
    });
    expect(mocks.changePassword.mock.calls[0]?.[2]).toBe("eski-oturum");
    expect(mocks.changePassword.mock.calls[0]?.[5]).toMatchObject({ userAgent: "test-agent" });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("yeni-token");
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe("yeni-csrf");
    expect(await response.json()).toMatchObject({
      data: { changed: true, otherSessionsRevoked: true, sessionRotated: true },
    });
    // Rota modülü geniş bir içe aktarma ağacı yükler; küçük makinede ilk yükleme yavaş.
  }, 120_000);
});
