import { describe, expect, it } from "vitest";
import {
  entryBodySchema,
  hasMeaningfulEntryChange,
  normalizeEntryBody,
  normalizeEntrySearchText,
} from "@/modules/entries/domain/entry";

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
});
