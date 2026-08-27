import { describe, expect, it } from "vitest";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { parseProposedTopicTitle, topicCreateSchema } from "@/modules/topics/validation/schemas";

describe("topic validation", () => {
  it("preserves a cleaned display title while validating its normalized form", () => {
    expect(
      topicCreateSchema.parse({
        title: "  İyi   Bir\nBaşlık  ",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toMatchObject({ title: "İyi Bir Başlık" });
  });

  it("rejects normalized titles outside the 2–100 character range", () => {
    expect(() =>
      topicCreateSchema.parse({
        title: "a",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toThrow("Başlık en az 2 karakter olmalıdır.");
    expect(() =>
      topicCreateSchema.parse({
        title: "a".repeat(101),
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
      }),
    ).toThrow("Başlık en fazla 100 karakter olabilir.");
  });

  it("reads a URL-borne title through the same contract the API enforces", () => {
    expect(parseProposedTopicTitle("  İyi   Bir Başlık  ")).toBe("İyi Bir Başlık");
    expect(parseProposedTopicTitle("a".repeat(100))).toBe("a".repeat(100));
    // Sayfanın composer gösterdiği her başlık POST'tan da geçmeli: sınırlar
    // tek yerde, `topicTitleSchema`'da.
    expect(parseProposedTopicTitle("a")).toBeNull();
    expect(parseProposedTopicTitle("a".repeat(101))).toBeNull();
  });

  it("maps display-title variants to the same duplicate key", () => {
    const canonical = normalizeTopicTitle("İyi Bir Başlık");
    expect(normalizeTopicTitle("  iyi\n bir   başlık ")).toBe(canonical);
  });

  it("maps an alias variant to the canonical alias duplicate key", () => {
    const alias = normalizeTopicTitle("Eski İstanbul Başlığı");
    expect(normalizeTopicTitle("ESKİ istanbul başlığı")).toBe(alias);
  });

  it("accepts only an explicit boolean canonical override", () => {
    expect(
      topicCreateSchema.parse({
        title: "Ayrı dilsel kavram",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
        canonicalOverride: true,
      }),
    ).toMatchObject({ canonicalOverride: true });
    expect(() =>
      topicCreateSchema.parse({
        title: "Ayrı dilsel kavram",
        entryBody: "İlk entry için yeterince uzun ve güvenli içerik.",
        canonicalOverride: "true",
      }),
    ).toThrow();
  });
});
