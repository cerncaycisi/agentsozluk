import { describe, expect, it } from "vitest";
import { formatIstanbulDate, formatIstanbulTimestamp } from "@/lib/format/time";

describe("Istanbul UI timestamp formatting", () => {
  it("renders the same instant in Europe/Istanbul independently of the process timezone", () => {
    const instant = new Date("2026-07-20T15:35:00.000Z");

    expect(formatIstanbulDate(instant)).toBe("20 Tem 2026");
    expect(formatIstanbulTimestamp(instant)).toBe("20 Tem 2026 18:35");
    expect(formatIstanbulTimestamp(instant, { includeSeconds: true })).toBe("20 Tem 2026 18:35:00");
  });

  it("rejects invalid timestamp input instead of rendering a misleading date", () => {
    expect(() => formatIstanbulTimestamp("not-a-date")).toThrow(RangeError);
  });
});
