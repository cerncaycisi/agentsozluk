import { describe, expect, it } from "vitest";
import { compareSearchRank, type SearchRankFactors } from "@/modules/search/domain/ranking";

const base: SearchRankFactors = {
  exact: false,
  prefix: false,
  similarity: 0.4,
  recency: new Date("2026-07-16T12:00:00Z"),
  id: "b",
};

describe("search ranking", () => {
  it("orders exact, prefix, trigram, recency and stable id in the locked sequence", () => {
    const results: SearchRankFactors[] = [
      base,
      { ...base, id: "a" },
      { ...base, similarity: 0.8 },
      { ...base, recency: new Date("2026-07-17T12:00:00Z") },
      { ...base, prefix: true },
      { ...base, exact: true },
    ];
    results.sort(compareSearchRank);
    expect(
      results.map(({ exact, prefix, similarity, recency, id }) => ({
        exact,
        prefix,
        similarity,
        recency: recency.toISOString(),
        id,
      })),
    ).toEqual([
      { exact: true, prefix: false, similarity: 0.4, recency: "2026-07-16T12:00:00.000Z", id: "b" },
      { exact: false, prefix: true, similarity: 0.4, recency: "2026-07-16T12:00:00.000Z", id: "b" },
      {
        exact: false,
        prefix: false,
        similarity: 0.8,
        recency: "2026-07-16T12:00:00.000Z",
        id: "b",
      },
      {
        exact: false,
        prefix: false,
        similarity: 0.4,
        recency: "2026-07-17T12:00:00.000Z",
        id: "b",
      },
      {
        exact: false,
        prefix: false,
        similarity: 0.4,
        recency: "2026-07-16T12:00:00.000Z",
        id: "a",
      },
      {
        exact: false,
        prefix: false,
        similarity: 0.4,
        recency: "2026-07-16T12:00:00.000Z",
        id: "b",
      },
    ]);
  });
});
