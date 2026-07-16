import { describe, expect, it } from "vitest";
import { normalizeSearchQuery, shouldSearchDatabase } from "@/modules/search/domain/normalization";

describe("search normalization", () => {
  it("normalizes Unicode, whitespace and Turkish case", () => {
    expect(normalizeSearchQuery("  İYİ   ＡGENT  ")).toBe("iyi agent");
  });

  it("does not query the database outside the 2–100 character boundary", () => {
    expect(shouldSearchDatabase("a")).toBe(false);
    expect(shouldSearchDatabase("ab")).toBe(true);
    expect(shouldSearchDatabase("a".repeat(100))).toBe(true);
    expect(shouldSearchDatabase("a".repeat(101))).toBe(false);
  });
});
