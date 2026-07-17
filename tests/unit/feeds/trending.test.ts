import { describe, expect, it } from "vitest";
import { boundedFeedWindow, topicFeedWindowStart } from "@/modules/feeds/domain/feed";
import { calculateTrendScore } from "@/modules/feeds/domain/trending";
import { topicFeedSchema } from "@/modules/feeds/validation/schemas";

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

  it("caps a feed at 30 records and validates feed names", () => {
    expect(boundedFeedWindow(25, 20)).toEqual({ skip: 25, take: 5 });
    expect(boundedFeedWindow(30, 20)).toEqual({ skip: 30, take: 0 });
    expect(topicFeedSchema.parse("trending")).toBe("trending");
    expect(topicFeedSchema.safeParse("unknown").success).toBe(false);
    expect(topicFeedWindowStart("trending", new Date("2026-07-17T12:00:00.000Z"))).toEqual(
      new Date("2026-07-16T12:00:00.000Z"),
    );
  });
});
