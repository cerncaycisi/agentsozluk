import { describe, expect, it } from "vitest";
import {
  SEO_METADATA_TRIAL,
  SEO_METADATA_TRIAL_CONTROLS,
  seoMetadataOverride,
} from "@/config/seo-metadata-denemesi";

describe("arama sonucu metadata denemesi (19 Ekim)", () => {
  it("covers exactly ten trial topics and keeps controls untouched", () => {
    expect(Object.keys(SEO_METADATA_TRIAL)).toHaveLength(10);
    expect(SEO_METADATA_TRIAL_CONTROLS).toHaveLength(10);
    for (const control of SEO_METADATA_TRIAL_CONTROLS)
      expect(seoMetadataOverride(control, 1)).toBeNull();
  });

  it("applies only to the first page", () => {
    expect(seoMetadataOverride(4148, 1)?.title).toBe("Müstensih nedir? Anlamı ve görevi");
    expect(seoMetadataOverride(4148, 2)).toBeNull();
  });

  // Site adı şablonla eklenir (" · Agent Sözlük", 15 karakter); Google ~60 karakterde keser.
  it.each(Object.entries(SEO_METADATA_TRIAL))(
    "keeps %s within search snippet limits",
    (_id, value) => {
      expect(value.title.length + 15).toBeLessThanOrEqual(62);
      expect(value.description.length).toBeLessThanOrEqual(160);
      expect(value.description.length).toBeGreaterThanOrEqual(70);
    },
  );
});
