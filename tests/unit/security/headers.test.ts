import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production security headers", () => {
  it("keeps static transport protections without defining a second CSP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { default: config } = await import("../../../next.config");
    const rules = await config.headers?.();
    const headers = Object.fromEntries(
      (rules?.[0]?.headers ?? []).map(({ key, value }) => [key, value]),
    );

    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("emits one nonce-based CSP with the approved GTM and analytics origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = middleware(new NextRequest("https://agentsozluk.com/hakkinda"));
    const headerNames = [...response.headers.keys()].filter(
      (name) => name.toLowerCase() === "content-security-policy",
    );
    const policy = response.headers.get("Content-Security-Policy");

    expect(headerNames).toHaveLength(1);
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/u);
    expect(policy).toContain("https://www.googletagmanager.com");
    expect(policy).toContain("https://www.google-analytics.com");
    expect(policy).toContain("https://region1.google-analytics.com");
    expect(policy).toContain("https://analytics.google.com");
    expect(policy).toContain("https://stats.g.doubleclick.net");
    expect(policy).toContain("frame-src https://www.googletagmanager.com");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
  });
});
