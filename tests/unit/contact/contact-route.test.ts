import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

/*
  Sahte modüllerin imzaları açıkça yazılı: `vi.fn(async () => …)` argümansız bir
  imza çıkarıyor ve `mock.calls[0]![2]` tip hatası veriyor (CI typecheck, 22 Eylül).
*/
const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn((): unknown => ({})),
  enforceRateLimit: vi.fn(async (..._args: unknown[]): Promise<void> => {}),
  requestIp: vi.fn((): string => "203.0.113.9"),
  clearRequestActorId: vi.fn((): void => {}),
  csrfSession: vi.fn(async (_request: unknown): Promise<{ userId: string }> => {
    throw new AppError("AUTH_REQUIRED", 401, "Giriş gerekli.");
  }),
  submitContactMessage: vi.fn(
    async (..._args: unknown[]): Promise<{ id: string; createdAt: Date }> => ({
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date("2026-09-22T10:00:00.000Z"),
    }),
  ),
}));

vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/rate-limit/application/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  requestIp: mocks.requestIp,
}));
vi.mock("@/lib/auth/request-session", () => ({ csrfSession: mocks.csrfSession }));
vi.mock("@/lib/logging/request-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/request-context")>()),
  clearRequestActorId: mocks.clearRequestActorId,
}));
vi.mock("@/modules/contact/application/contact", () => ({
  submitContactMessage: mocks.submitContactMessage,
}));

const { POST } = await import("@/app/api/v1/iletisim/route");

/*
  Köken, ortamın `APP_URL`'inden türetiliyor: CI `http://127.0.0.1:3000`,
  yerel kurulum `http://localhost:3000` kullanıyor ve sabit yazılmış köken
  CI'da `assertValidOrigin`'e takılıyordu (22 Eylül).
*/
const SITE = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

function istek(gövde: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${SITE}/api/v1/iletisim`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, ...headers },
    body: JSON.stringify(gövde),
  });
}

const gecerli = { kind: "CONTENT_REMOVAL", message: "Bu entry kaldırılsın lütfen." };

describe("POST /api/v1/iletisim", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockClear();
    mocks.submitContactMessage.mockClear();
    mocks.clearRequestActorId.mockClear();
    mocks.csrfSession.mockReset();
    mocks.csrfSession.mockImplementation(async () => {
      throw new AppError("AUTH_REQUIRED", 401, "Giriş gerekli.");
    });
  });

  it("anonim gönderimi kabul eder ve IP başına oran sınırı uygular", async () => {
    const response = await POST(istek(gecerli));
    expect(response.status).toBe(201);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "iletisim:203.0.113.9",
      // Pencere de sözleşmenin parçası: yanlış değere çevrilirse bu test düşer.
      { action: "contact:ip", limit: 5, windowMs: 60 * 60 * 1000 },
    );
    expect(mocks.submitContactMessage.mock.calls[0]![2]).toMatchObject({ submitterId: null });
  });

  it("başka kökenden gelen gönderimi reddeder ve hiç yazmaz", async () => {
    const response = await POST(istek(gecerli, { origin: "https://baska-site.example" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "ORIGIN_INVALID" } });
    expect(mocks.submitContactMessage).not.toHaveBeenCalled();
  });

  it("oturum ve geçerli CSRF anahtarı varsa göndereni kaydeder", async () => {
    mocks.csrfSession.mockResolvedValue({ userId: "22222222-2222-4222-8222-222222222222" });
    const response = await POST(istek(gecerli));
    expect(response.status).toBe(201);
    expect(mocks.submitContactMessage.mock.calls[0]![2]).toMatchObject({
      submitterId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("CSRF anahtarı geçersizse iletiyi anonim yazar, kullanıcıyı hataya düşürmez", async () => {
    mocks.csrfSession.mockRejectedValue(
      new AppError("CSRF_INVALID", 403, "Güvenlik doğrulaması başarısız oldu."),
    );
    const response = await POST(istek(gecerli));
    expect(response.status).toBe(201);
    expect(mocks.submitContactMessage.mock.calls[0]![2]).toMatchObject({ submitterId: null });
    /*
      `requestSession` aktörü CSRF kontrolünden önce yazıyor. İleti anonim
      kaydedildiği için istek logu da anonim kalmalı; yoksa aynı işlem iki ayrı
      kimlikle görünür (Sol, 22 Eylül).
    */
    expect(mocks.clearRequestActorId).toHaveBeenCalledTimes(1);
  });

  it("oturum geçerliyken istek logundaki kimliği silmez", async () => {
    mocks.csrfSession.mockResolvedValue({ userId: "22222222-2222-4222-8222-222222222222" });
    await POST(istek(gecerli));
    expect(mocks.clearRequestActorId).not.toHaveBeenCalled();
  });

  it("beklenmeyen bir oturum hatasını yutmaz", async () => {
    mocks.csrfSession.mockRejectedValue(new Error("veritabanı düştü"));
    const response = await POST(istek(gecerli));
    expect(response.status).toBe(500);
    expect(mocks.submitContactMessage).not.toHaveBeenCalled();
  });

  it("geçersiz gövdeyi doğrulama hatasıyla reddeder", async () => {
    const response = await POST(istek({ kind: "CONTENT_REMOVAL", message: "kısa" }));
    expect(response.status).toBe(422);
    expect(mocks.submitContactMessage).not.toHaveBeenCalled();
  });

  it("oran sınırı aşıldığında yazmaz", async () => {
    mocks.enforceRateLimit.mockRejectedValueOnce(
      new AppError("RATE_LIMITED", 429, "Çok fazla istek gönderdiniz."),
    );
    const response = await POST(istek(gecerli));
    expect(response.status).toBe(429);
    expect(mocks.submitContactMessage).not.toHaveBeenCalled();
  });
});
