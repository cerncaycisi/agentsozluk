import { describe, expect, it } from "vitest";
import { fixedWindow } from "@/modules/rate-limit/application/rate-limit";

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
});
