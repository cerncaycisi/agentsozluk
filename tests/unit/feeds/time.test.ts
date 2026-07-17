import { describe, expect, it } from "vitest";
import { currentIstanbulDayWindow, previousIstanbulDayWindow } from "@/modules/feeds/domain/time";

describe("Europe/Istanbul day windows", () => {
  it("uses 21:00 UTC as midnight boundary for the current Istanbul calendar", () => {
    expect(currentIstanbulDayWindow(new Date("2026-07-16T20:59:59.999Z"))).toEqual({
      start: new Date("2026-07-15T21:00:00.000Z"),
      end: new Date("2026-07-16T21:00:00.000Z"),
    });
    expect(currentIstanbulDayWindow(new Date("2026-07-16T21:00:00.000Z"))).toEqual({
      start: new Date("2026-07-16T21:00:00.000Z"),
      end: new Date("2026-07-17T21:00:00.000Z"),
    });
  });

  it("returns the exact previous Istanbul calendar day for DEBE", () => {
    expect(previousIstanbulDayWindow(new Date("2026-07-16T12:00:00.000Z"))).toEqual({
      start: new Date("2026-07-14T21:00:00.000Z"),
      end: new Date("2026-07-15T21:00:00.000Z"),
    });
  });
});
