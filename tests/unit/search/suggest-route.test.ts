import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import { RATE_LIMIT_RULES } from "@/modules/rate-limit/domain/rules";
import type * as RateLimitModule from "@/modules/rate-limit/application/rate-limit";
import type * as SuggestModule from "@/modules/search/application/suggest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(() => ({ marker: "database" })),
  optionalRequestSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  searchSuggestions: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/auth/request-session", () => ({
  optionalRequestSession: mocks.optionalRequestSession,
}));
vi.mock("@/modules/rate-limit/application/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/modules/search/application/suggest", async (importOriginal) => ({
  ...(await importOriginal<typeof SuggestModule>()),
  searchSuggestions: mocks.searchSuggestions,
}));

const { GET } = await import("@/app/api/v1/search/suggest/route");

function suggestRequest(query: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/search/suggest?q=${encodeURIComponent(query)}`,
  );
}

describe("GET /api/v1/search/suggest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatabase.mockReturnValue({ marker: "database" });
    mocks.optionalRequestSession.mockResolvedValue(null);
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.searchSuggestions.mockResolvedValue({ topics: [], users: [] });
  });

  it("returns the bare topics/users contract for a visitor", async () => {
    mocks.searchSuggestions.mockResolvedValue({
      topics: [{ title: "açık kaynak", url: "/baslik/acik-kaynak--1" }],
      users: [{ username: "acikkaynakci", url: "/yazar/acikkaynakci" }],
    });

    const response = await GET(suggestRequest("açık"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      topics: [{ title: "açık kaynak", url: "/baslik/acik-kaynak--1" }],
      users: [{ username: "acikkaynakci", url: "/yazar/acikkaynakci" }],
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      { marker: "database" },
      expect.stringMatching(/^ip:/u),
      RATE_LIMIT_RULES.searchVisitor,
    );
  });

  it("uses the authenticated rule and a private cache directive for a session", async () => {
    mocks.optionalRequestSession.mockResolvedValue({ userId: "user-1" });

    const response = await GET(suggestRequest("açık"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      { marker: "database" },
      "user:user-1",
      RATE_LIMIT_RULES.searchAuthenticated,
    );
  });

  it("returns an empty payload below two characters without spending rate limit quota", async () => {
    const response = await GET(suggestRequest("a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ topics: [], users: [] });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.optionalRequestSession).not.toHaveBeenCalled();
  });

  it("answers 429 instead of 500 when the rate limit is exceeded", async () => {
    mocks.enforceRateLimit.mockRejectedValue(
      new AppError("RATE_LIMITED", 429, "Çok fazla istek gönderdiniz.", undefined, {
        "Retry-After": "42",
      }),
    );

    const response = await GET(suggestRequest("açık"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(mocks.searchSuggestions).not.toHaveBeenCalled();
  });

  it("still answers 500 for an unexpected failure", async () => {
    mocks.searchSuggestions.mockRejectedValue(new Error("boom"));

    const response = await GET(suggestRequest("açık"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
