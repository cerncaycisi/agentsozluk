import { describe, expect, it } from "vitest";
import {
  assertSourceScoreWeeklyBudget,
  istanbulWeekWindow,
} from "@/modules/agents/domain/source-evolution";

describe("source evolution weekly budget", () => {
  it("uses a Monday-to-Monday Europe/Istanbul window", () => {
    const window = istanbulWeekWindow(new Date("2026-07-18T12:00:00.000Z"));
    expect(window).toEqual({
      start: new Date("2026-07-12T21:00:00.000Z"),
      end: new Date("2026-07-19T21:00:00.000Z"),
    });
  });

  it("charges admin and reflection audit changes to one absolute score budget", () => {
    const audits = [
      {
        metadata: {
          changeOrigin: "ADMIN",
          scoreChanges: { trustScore: { from: 0.5, to: 0.56 } },
        },
      },
    ];
    expect(
      assertSourceScoreWeeklyBudget({
        audits,
        changes: { trustScore: { from: 0.56, to: 0.6 } },
      }),
    ).toMatchObject({
      trustScore: { usedBefore: 0.06, requested: 0.04, usedAfter: 0.1, bound: 0.1 },
    });
    expect(() =>
      assertSourceScoreWeeklyBudget({
        audits,
        changes: { trustScore: { from: 0.56, to: 0.61 } },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: expect.objectContaining({ reasonCode: "SOURCE_WEEKLY_DELTA_BUDGET_EXCEEDED" }),
      }),
    );
  });
});
