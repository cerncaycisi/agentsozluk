import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/logging/logger";
import type * as RateLimitModule from "@/modules/rate-limit/application/rate-limit";

const mocks = vi.hoisted(() => ({
  loginHuman: vi.fn(),
  observeRateLimit: vi.fn(),
  enforceRateLimit: vi.fn(),
  incrementRateLimitBucket: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/auth/application/authenticate", () => ({ loginHuman: mocks.loginHuman }));
vi.mock("@/modules/rate-limit/application/rate-limit", async (original) => ({
  ...(await original<typeof RateLimitModule>()),
  enforceRateLimit: mocks.enforceRateLimit,
  observeRateLimit: mocks.observeRateLimit,
}));

/*
  Hesap bazlı başarısız giriş TESPİTİ (Astra önerisi, 20 Eylül): engellemez,
  eşikte bir kez güvenlik kaydı üretir; kayıtta e-posta yoktur.
*/
function loginRequest(email: string) {
  return new NextRequest("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify({ email, password: "YanlisSifre123!" }),
  });
}

describe("POST /api/v1/auth/login — başarısız giriş tespiti", () => {
  beforeEach(() => {
    mocks.loginHuman.mockReset();
    mocks.observeRateLimit.mockReset();
    mocks.enforceRateLimit.mockReset();
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("hatalı şifrede sayar, reddetmez; eşikte e-postasız güvenlik kaydı üretir", async () => {
    const warn = vi.spyOn(logger, "warn");
    mocks.loginHuman.mockRejectedValue(
      new AppError("INVALID_CREDENTIALS", 401, "E-posta veya şifre hatalı."),
    );
    mocks.observeRateLimit.mockResolvedValue({
      count: 11,
      keyHash: "a".repeat(64),
      thresholdCrossed: true,
    });
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const response = await POST(loginRequest("kurban@example.test"));
    expect(response.status).toBe(401);
    expect(mocks.observeRateLimit.mock.calls[0]?.[1]).toBe("account:kurban@example.test");
    const kayit = warn.mock.calls.find(
      ([fields]) =>
        typeof fields === "object" &&
        fields !== null &&
        (fields as { event?: string }).event === "security.login_failure_threshold",
    );
    expect(kayit?.[0]).toMatchObject({ account: "a".repeat(16), threshold: 10 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("kurban@example.test");
  }, 120_000);

  it("başarılı girişte sayaç çalışmaz; sayaç hatası yanıtı değiştirmez", async () => {
    mocks.loginHuman.mockRejectedValue(new AppError("VALIDATION_ERROR", 422, "Geçersiz."));
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const other = await POST(loginRequest("biri@example.test"));
    expect(other.status).toBe(422);
    expect(mocks.observeRateLimit).not.toHaveBeenCalled();

    const warn = vi.spyOn(logger, "warn");
    mocks.loginHuman.mockRejectedValue(
      new AppError("INVALID_CREDENTIALS", 401, "E-posta veya şifre hatalı."),
    );
    mocks.observeRateLimit.mockRejectedValue(new Error("veritabanı yok"));
    const failed = await POST(loginRequest("biri@example.test"));
    expect(failed.status).toBe(401);
    expect(
      warn.mock.calls.some(
        ([fields]) =>
          (fields as { event?: string }).event === "security.login_failure_observe_failed",
      ),
    ).toBe(true);
  }, 120_000);
});
