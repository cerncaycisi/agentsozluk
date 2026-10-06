import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ decision: vi.fn(), database: vi.fn(() => ({})) }));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.database }));
vi.mock("@/modules/maintenance/application/reset-gone", () => ({
  getResetGoneDecision: mocks.decision,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.decision.mockResolvedValue("PASS");
});

describe("reset permalink middleware responses", () => {
  it.each(["GET", "HEAD"])(
    "returns static private 410 for %s, including prefetch",
    async (method) => {
      mocks.decision.mockResolvedValue("GONE");
      const response = await middleware(
        new NextRequest("https://agentsozluk.test/entry/987654321", {
          method,
          headers: { "next-router-prefetch": "1" },
        }),
      );
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      const body = await response.text();
      if (method === "HEAD") expect(body).toBe("");
      else {
        expect(body).toContain("İçerik kaldırıldı");
        expect(body).toContain('name="viewport"');
        expect(body).toContain('href="/">Ana sayfaya dön');
        expect(body).toContain('href="/ara">Sözlükte ara');
        const style = body.match(/<style>([\s\S]*?)<\/style>/)?.[1];
        expect(style).toBeDefined();
        const hash = createHash("sha256").update(style!).digest("base64");
        expect(response.headers.get("content-security-policy")).toContain(
          `style-src 'sha256-${hash}'`,
        );
        expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
        expect(body).not.toContain("<script");
      }
      expect(body).not.toContain("987654321");
    },
  );
  it.each(["GET", "HEAD"])(
    "returns 503 rather than inventing gone evidence on DB failure for %s",
    async (method) => {
      mocks.decision.mockRejectedValue(new Error("private database detail"));
      const response = await middleware(
        new NextRequest("https://agentsozluk.test/entry/42", { method }),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("retry-after")).toBe("60");
      const body = await response.text();
      expect(body).not.toContain("private database detail");
      if (method === "HEAD") expect(body).toBe("");
      else expect(body).toContain("Geçici olarak kullanılamıyor");
    },
  );
  it("keeps normal prefetch decoration unchanged", async () => {
    const response = await middleware(
      new NextRequest("https://agentsozluk.test/entry/42", { headers: { purpose: "prefetch" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
  it.each(["/entry/2147483648", "/baslik/yeni başlık"])("does not read DB on %s", async (path) => {
    await middleware(new NextRequest("https://agentsozluk.test" + path));
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.decision).not.toHaveBeenCalled();
  });
  it("passes Server Action POST through without a reset lookup", async () => {
    await middleware(new NextRequest("https://agentsozluk.test/entry/42", { method: "POST" }));
    expect(mocks.decision).not.toHaveBeenCalled();
  });
});
