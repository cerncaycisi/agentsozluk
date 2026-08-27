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

  /*
    Görünmez biçim karakterleri kopya başlık üretiyordu: ekranda tek bir `Türkiye`
    görünürken sözlükte iki ayrı adres olabiliyordu. Karşılaştırma anahtarından
    atılıyor, görünen başlıktan değil.
  */
  it("collapses invisible format characters into the same comparison key", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["Türkiye", "T\u200bürkiye"], // sıfır genişlikli boşluk
      ["gürültü", "gürültü\u200d"], // ZWJ
      ["mulligan", "mul\u00adligan"], // yumuşak tire
      ["anbean", "\ufeffanbean"], // BOM
      ["kritik yük", "kritik\u200c yük"], // ZWNJ
    ];
    for (const [plain, invisible] of cases)
      expect(normalizeTopicTitle(invisible)).toBe(normalizeTopicTitle(plain));
  });

  it("keeps genuinely different titles apart after the invisible-character strip", () => {
    expect(normalizeTopicTitle("t\u200bürkiye")).not.toBe(normalizeTopicTitle("türkçe"));
    // Yalnız görünmezleri atıyor; anlamlı boşluk duruyor.
    expect(normalizeTopicTitle("kritik\u200byük")).not.toBe(normalizeTopicTitle("kritik yük"));
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

  it("unifies proper-noun case suffixes that follow an apostrophe", () => {
    const observedPairs = [
      ["Kazakistan'da erken parlamento seçimleri", "Kazakistan erken parlamento seçimleri"],
      ["Tahtakale'de leylek ölümleri", "Tahtakale leylek ölümleri"],
      ["TURKA'nın yeni nesil araç muayene merkezi", "TURKA yeni nesil araç muayene merkezi"],
      ["Oak Park'ta gazlı cihaz yasağı", "Oak Park gazlı cihaz yasağı"],
    ] as const;
    for (const [inflected, canonical] of observedPairs) {
      expect(topicCanonicalSearchCandidates(inflected)).toContainEqual({
        query: canonical,
        normalizedQuery: normalizeTopicTitle(canonical),
        reason: "APOSTROPHE_CASE_SUFFIX",
      });
      expect(preferredTopicCreationSearchQuery(inflected)).toBe(canonical);
    }
  });

  it("accepts both apostrophe characters and keeps the rest of the title", () => {
    expect(topicCanonicalSearchCandidates("Tahtakale’de leylek ölümleri")).toEqual([
      {
        query: "Tahtakale’de leylek ölümleri",
        normalizedQuery: "tahtakale’de leylek ölümleri",
        reason: "EXACT_TITLE",
      },
      {
        query: "Tahtakale leylek ölümleri",
        normalizedQuery: "tahtakale leylek ölümleri",
        reason: "APOSTROPHE_CASE_SUFFIX",
      },
    ]);
    expect(preferredTopicCreationSearchQuery("Türkiye'den Almanya’ya göç")).toBe(
      "Türkiye Almanya göç",
    );
  });

  it("leaves a title without an apostrophe untouched", () => {
    expect(topicCanonicalSearchCandidates("Kazakistan erken parlamento seçimleri")).toEqual([
      {
        query: "Kazakistan erken parlamento seçimleri",
        normalizedQuery: "kazakistan erken parlamento seçimleri",
        reason: "EXACT_TITLE",
      },
    ]);
    expect(preferredTopicCreationSearchQuery("Moody's raporu")).toBe("Moody's raporu");
  });

  it("deliberately does not unify possessive or verbal-noun pairs", () => {
    expect(topicCanonicalSearchCandidates("haberlerden kaçınmak").map((c) => c.reason)).toEqual([
      "EXACT_TITLE",
    ]);
    expect(
      topicCanonicalSearchCandidates("haberlerden kaçınmak").map((c) => c.normalizedQuery),
    ).not.toContain(normalizeTopicTitle("haberlerden kaçınma"));
    expect(preferredTopicCreationSearchQuery("haberlerden kaçınma")).toBe("haberlerden kaçınma");
    expect(preferredTopicCreationSearchQuery("uçak taşıması")).toBe("uçak taşıması");
  });

  it("keeps the narrower about and question variants ahead of the case-suffix variant", () => {
    expect(
      topicCanonicalSearchCandidates("Kazakistan'da seçimler hakkında").map((c) => c.reason),
    ).toEqual(["EXACT_TITLE", "ABOUT_SUFFIX", "APOSTROPHE_CASE_SUFFIX"]);
    expect(preferredTopicCreationSearchQuery("Kazakistan'da seçimler hakkında")).toBe(
      "Kazakistan'da seçimler",
    );
  });

  it("does not let the case-suffix variant touch topic identity", () => {
    expect(normalizeTopicTitle("Kazakistan'da erken parlamento seçimleri")).toBe(
      "kazakistan'da erken parlamento seçimleri",
    );
    expect(createTopicSlug("Kazakistan'da erken parlamento seçimleri")).toBe(
      "kazakistan-da-erken-parlamento-secimleri",
    );
  });

  it("does not rewrite ambiguous question-like concepts", () => {
    expect(topicCanonicalSearchCandidates("neden olmasın")).toEqual([
      { query: "neden olmasın", normalizedQuery: "neden olmasın", reason: "EXACT_TITLE" },
    ]);
    expect(preferredTopicCreationSearchQuery("php mi asp mi")).toBe("php mi asp mi");
    expect(preferredTopicCreationSearchQuery("php mi asp mi?")).toBe("php mi asp mi");
  });
});
