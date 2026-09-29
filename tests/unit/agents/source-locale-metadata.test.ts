import { describe, expect, it } from "vitest";

import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  expandedTurkishLanguageSourceUrls,
  expandedVerifiedSources,
} from "@/modules/agents/personas/expanded-sources";
import { uniqueVerifiedSourcePool } from "@/modules/agents/personas/source-assignment";
import {
  isTurkishOrTurkeyFocused,
  reconciledSourceLocaleFocus,
  reviewedSourceLocaleFocus,
  reviewedTurkishOrTurkeyFocusedSourceUrls,
} from "@/modules/agents/personas/source-locale-metadata";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";

const packUrls = uniqueVerifiedSourcePool(
  seedPersonaPackSchema.parse(originalPersonaPack).personas,
).map(({ url }) => url);
// Paket havuzu + genişletilmiş doğrulanmış havuz (29 Eylül 2026).
const canonicalUrls = new Set([...packUrls, ...expandedVerifiedSources.map(({ url }) => url)]);

describe("reviewed source locale metadata", () => {
  it("keeps the reviewed Turkish or Türkiye-focused floor explicit", () => {
    const reviewed = reviewedTurkishOrTurkeyFocusedSourceUrls();

    // 43 paket kaynağı + genişletilmiş havuzun Türkçe kaynakları (29 Eylül 2026).
    expect(new Set(reviewed).size).toBe(reviewed.length);
    expect(reviewed.length).toBeGreaterThan(43);
    for (const url of expandedTurkishLanguageSourceUrls) expect(reviewed).toContain(url);
    expect(reviewed).toEqual([...reviewed].sort());
    expect(reviewed.every((url) => canonicalUrls.has(url))).toBe(true);
    expect(reviewed.every((url) => isTurkishOrTurkeyFocused(reviewedSourceLocaleFocus(url)))).toBe(
      true,
    );
  });

  it("classifies exact reviewed URLs without guessing from host names", () => {
    expect(reviewedSourceLocaleFocus("https://t24.com.tr/rss")).toBe("GLOBAL");
    expect(reviewedSourceLocaleFocus("https://www.newslabturkey.org/feed/")).toBe("TURKEY_FOCUSED");
    expect(reviewedSourceLocaleFocus("https://turkiye.un.org/tr/stories/rss.xml")).toBe(
      "TURKISH_LANGUAGE_AND_TURKEY_FOCUSED",
    );
    expect(reviewedSourceLocaleFocus("https://example.com/tr/feed")).toBe("GLOBAL");
  });

  it("keeps an existing admin-reviewed classification during canonical reconciliation", () => {
    expect(reconciledSourceLocaleFocus("TURKEY_FOCUSED", "https://t24.com.tr/rss")).toBe(
      "TURKEY_FOCUSED",
    );
    expect(reconciledSourceLocaleFocus(null, "https://t24.com.tr/rss")).toBe("GLOBAL");
  });
});
