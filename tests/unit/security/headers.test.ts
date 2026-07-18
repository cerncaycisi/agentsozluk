import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production security headers", () => {
  it("emits the required CSP and transport protections", async () => {
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
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain(
      "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-src https://www.googletagmanager.com",
    );
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'self'");
  });
});
