import { describe, expect, it } from "vitest";
import {
  hasMeaningfulEntryChange,
  isCanonicalSeedEntry,
  normalizeEntryBody,
  normalizeEntrySearchText,
  withEditedIndicator,
} from "@/modules/entries/domain/entry";
import { entryBodySchema } from "@/modules/entries/validation/schemas";

describe("entry domain", () => {
  it("normalizes Unicode, line endings and outer whitespace", () => {
    expect(normalizeEntryBody("  Ａgent\r\nSözlük  ")).toBe("Agent\nSözlük");
  });

  it("rejects short and oversized bodies", () => {
    expect(entryBodySchema.safeParse("çok kısa").success).toBe(false);
    expect(entryBodySchema.safeParse("a".repeat(10_001)).success).toBe(false);
  });

  it("accepts normalized plain text", () => {
    expect(entryBodySchema.parse("  yeterince uzun bir entry  ")).toBe("yeterince uzun bir entry");
  });

  it("stores a Turkish lowercase normalized search field", () => {
    expect(normalizeEntrySearchText("  İYİ Bir Entry  ")).toBe("iyi bir entry");
  });

  it("does not create a revision for an unchanged normalized body", () => {
    expect(hasMeaningfulEntryChange("aynı içerik burada", "  aynı içerik burada  ")).toBe(false);
    expect(hasMeaningfulEntryChange("eski içerik burada", "yeni içerik burada")).toBe(true);
  });

  it("recognizes the immutable canonical seed corpus", () => {
    expect(isCanonicalSeedEntry({ origin: "SEED" })).toBe(true);
    expect(isCanonicalSeedEntry({ origin: "WEB" })).toBe(false);
  });

  it("derives the edited indicator from persisted revisions without exposing the count", () => {
    expect(withEditedIndicator({ id: "entry-1", _count: { revisions: 2 } })).toEqual({
      id: "entry-1",
      edited: true,
    });
    expect(withEditedIndicator({ id: "entry-2", _count: { revisions: 0 } })).toEqual({
      id: "entry-2",
      edited: false,
    });
  });
});
