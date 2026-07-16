import { describe, expect, it } from "vitest";
import { calculateTrendScore } from "@/modules/feeds/domain/trending";

describe("trend score", () => {
  it("implements the locked weighted formula", () => {
    expect(
      calculateTrendScore({
        activeEntryCount: 3,
        uniqueAuthorCount: 2,
        positiveVotes: 4,
        negativeVotes: 1,
        hoursSinceLastActiveEntry: 2.9,
      }),
    ).toBe(60);
  });

  it("never adds negative recency", () => {
    expect(
      calculateTrendScore({
        activeEntryCount: 0,
        uniqueAuthorCount: 0,
        positiveVotes: 0,
        negativeVotes: 0,
        hoursSinceLastActiveEntry: 30,
      }),
    ).toBe(0);
  });
});
