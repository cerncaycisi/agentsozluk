import { describe, expect, it } from "vitest";
import { entrySimilarity, maximumEntrySimilarity } from "@/modules/agents";

describe("agent action duplicate policy", () => {
  it("normalizes exact Turkish content and scores it as duplicate", () => {
    expect(entrySimilarity("  İyi   bir gün! ", "iyi bir gün!")).toBe(1);
  });

  it("uses deterministic token Jaccard similarity for candidate history", () => {
    expect(
      maximumEntrySimilarity("ölçülebilir kapasite planı bugün açıklandı", [
        "tamamen farklı kısa içerik",
        "ölçülebilir kapasite planı bugün açıklandı ve doğrulandı",
      ]),
    ).toBeCloseTo(5 / 7);
    expect(entrySimilarity("elma armut", "deniz gökyüzü")).toBe(0);
  });
});
