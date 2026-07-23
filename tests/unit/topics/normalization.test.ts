import { describe, expect, it } from "vitest";
import {
  canonicalTopicPath,
  createTopicSlug,
  normalizeTopicTitle,
} from "@/modules/topics/domain/normalization";
import {
  preferredTopicCreationSearchQuery,
  topicCanonicalSearchCandidates,
} from "@/modules/topics/domain/canonicalization";

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

  it("derives conservative canonical searches from about and question suffixes", () => {
    expect(topicCanonicalSearchCandidates(" Elma hakkında bilgi ")).toEqual([
      {
        query: "Elma hakkında bilgi",
        normalizedQuery: "elma hakkında bilgi",
        reason: "EXACT_TITLE",
      },
      { query: "Elma", normalizedQuery: "elma", reason: "ABOUT_SUFFIX" },
    ]);
    expect(topicCanonicalSearchCandidates("Özgür yazılım nedir?")).toEqual([
      {
        query: "Özgür yazılım nedir?",
        normalizedQuery: "özgür yazılım nedir?",
        reason: "EXACT_TITLE",
      },
      { query: "Özgür yazılım", normalizedQuery: "özgür yazılım", reason: "QUESTION_SUFFIX" },
      {
        query: "Özgür yazılım nedir",
        normalizedQuery: "özgür yazılım nedir",
        reason: "QUESTION_SUFFIX",
      },
    ]);
    expect(preferredTopicCreationSearchQuery("Elma hakkında")).toBe("Elma");
    expect(preferredTopicCreationSearchQuery("Özgür yazılım nedir?")).toBe("Özgür yazılım");
  });

  it("does not rewrite ambiguous question-like concepts", () => {
    expect(topicCanonicalSearchCandidates("neden olmasın")).toEqual([
      { query: "neden olmasın", normalizedQuery: "neden olmasın", reason: "EXACT_TITLE" },
    ]);
    expect(preferredTopicCreationSearchQuery("php mi asp mi")).toBe("php mi asp mi");
    expect(preferredTopicCreationSearchQuery("php mi asp mi?")).toBe("php mi asp mi");
  });
});
