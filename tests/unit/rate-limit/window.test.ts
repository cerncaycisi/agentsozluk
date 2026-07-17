import { describe, expect, it } from "vitest";
import { fixedWindow, requestIp } from "@/modules/rate-limit/application/rate-limit";

describe("fixed rate-limit windows", () => {
  it("uses atomic-aligned windows and computes Retry-After at boundaries", () => {
    const windowMs = 60_000;
    expect(fixedWindow(new Date("2026-07-16T12:00:00.000Z"), windowMs)).toEqual({
      windowStart: new Date("2026-07-16T12:00:00.000Z"),
      retryAfter: 60,
    });
    expect(fixedWindow(new Date("2026-07-16T12:00:59.999Z"), windowMs)).toEqual({
      windowStart: new Date("2026-07-16T12:00:00.000Z"),
      retryAfter: 1,
    });
  });

  it("selects the trusted client address at the configured proxy hop", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "1";
    expect(
      requestIp(
        new Request("https://example.test", {
          headers: { "X-Forwarded-For": "203.0.113.8, 198.51.100.4, 192.0.2.2" },
        }),
      ),
    ).toBe("198.51.100.4");
    expect(requestIp(new Request("https://example.test"))).toBe("unknown");
  });
});
