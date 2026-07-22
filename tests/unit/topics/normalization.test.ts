import { describe, expect, it } from "vitest";
import {
  canonicalTopicPath,
  createTopicSlug,
  normalizeTopicTitle,
} from "@/modules/topics/domain/normalization";

describe("topic normalization", () => {
  it("uses NFKC and collapses line breaks and whitespace", () => {
    expect(normalizeTopicTitle("  Ａgent\r\n   Sözlük  ")).toBe("agent sözlük");
  });

  it("uses Turkish locale casing for İ, I, ı and i", () => {
    expect(normalizeTopicTitle("İ I ı i")).toBe("i ı ı i");
  });

  it("creates an ASCII slug with the locked Turkish rules", () => {
    expect(createTopicSlug("İlkbahar, yağmur ve ÇÖĞÜŞ!")).toBe("ilkbahar-yagmur-ve-cogus");
    expect(createTopicSlug("***")).toBe("baslik");
  });

  it("caps a slug at 80 characters without a trailing hyphen", () => {
    const slug = createTopicSlug(`${"a".repeat(79)} b`);
    expect(slug).toHaveLength(79);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("builds the canonical numeric public id and slug route", () => {
    expect(canonicalTopicPath(123, "Agent Sözlük")).toBe("/baslik/agent-sozluk--123");
  });
});
