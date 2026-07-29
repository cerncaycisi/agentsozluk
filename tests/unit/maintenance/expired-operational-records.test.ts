import { describe, expect, it } from "vitest";
import {
  expiredRecordCleanupOptions,
  oldestExpiredAgeSeconds,
} from "@/modules/maintenance/domain/expired-operational-records";

describe("expired operational-record cleanup policy", () => {
  it("uses bounded defaults and accepts explicit bounded overrides", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    expect(expiredRecordCleanupOptions([], now)).toEqual({
      now,
      batchSize: 500,
      maxBatches: 4,
    });
    expect(expiredRecordCleanupOptions(["--batch-size=2000", "--max-batches=10"], now)).toEqual({
      now,
      batchSize: 2_000,
      maxBatches: 10,
    });
  });

  it.each([
    ["--batch-size=0"],
    ["--batch-size=2001"],
    ["--max-batches=11"],
    ["--batch-size=1", "--batch-size=2"],
    ["--unknown=1"],
  ])("rejects unbounded or ambiguous arguments: %s", (...args) => {
    expect(() => expiredRecordCleanupOptions(args)).toThrow();
  });

  it("reports only a non-negative aggregate age", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    expect(oldestExpiredAgeSeconds(now, null)).toBeNull();
    expect(oldestExpiredAgeSeconds(now, new Date("2026-07-29T11:58:30.000Z"))).toBe(90);
    expect(oldestExpiredAgeSeconds(now, new Date("2026-07-29T12:00:30.000Z"))).toBe(0);
  });
});
