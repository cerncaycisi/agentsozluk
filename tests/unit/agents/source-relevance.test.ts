import { describe, expect, it } from "vitest";
import { findAgentPersonaTemplate } from "@/modules/agents/personas/templates";
import type { SourceReadItem } from "@/runtime/source-reader";
import { selectSourceReadItemsForPersona } from "@/runtime/source-relevance";

function item(index: number, title: string, safeText = title): SourceReadItem {
  return {
    canonicalUrl: `https://example.com/${index}`,
    title,
    publishedAt: null,
    safeText,
    contentHash: String(index).padStart(64, "0"),
  };
}

describe("persona-aware source item selection", () => {
  it("bağlaç ve kelime içi alt dizeleri ilgiden saymaz; çekimli ilgili öğeyi öne alır", () => {
    const items = [
      item(1, "masa ve sandalye"),
      item(2, "kısa not"),
      item(3, "mikrofilm"),
      item(4, "müziği düşünmek"),
    ];
    const selected = selectSourceReadItemsForPersona(items, {
      persona: {
        ...persona,
        interests: [
          { key: "film ve diziler", weight: 0.5, pinned: false },
          { key: "müzik", weight: 0.5, pinned: false },
        ],
      },
      sourceTopics: [],
    });
    expect(selected).toEqual([items[3], items[0], items[1]]);
  });
  const persona = {
    ...findAgentPersonaTemplate("dengeharitasi")!,
    interests: [
      { key: "tedarik ve maliyet", weight: 0.4, pinned: false },
      { key: "kişisel finans", weight: 0.35, pinned: false },
      { key: "enflasyon deneyimi", weight: 0.25, pinned: false },
    ],
  };

  it("güncel persona ilgisini kaynak etiketinden ve eski yazdığı konudan önce sıralar", () => {
    const items = [item(1, "gündelik hayat"), item(2, "müzikal"), item(3, "film ve diziler")];
    const select = (key: string) =>
      selectSourceReadItemsForPersona(items, {
        persona: { ...persona, interests: [{ key, weight: 0.2, pinned: false }] },
        sourceTopics: ["gündelik hayat"],
        recentTopicTitles: ["gündelik hayat"],
      });
    expect(select("müzik")[0]).toEqual(items[1]);
    expect(select("film ve diziler")[0]).toEqual(items[2]);
  });

  it("keeps writer-local matches and only a bounded amount of unrelated discovery", () => {
    const items = [
      item(1, "Başakşehir Avrupa kupalarına veda etti"),
      item(2, "Birleşmiş Milletler yeni oylamaya hazırlanıyor"),
      item(3, "Tedarik zincirinde yedek parça maliyeti yükseldi"),
      item(4, "Enflasyon tüketici bütçesini yeniden şekillendiriyor"),
      item(5, "Hazırlık maçında tek gol"),
      item(6, "Onarım ve bakım fiyatları karşılaştırması"),
      item(7, "Yeni sinema filminin galası yapıldı"),
      item(8, "Kişisel finans için kredi maliyeti hesabı"),
      item(9, "Milli takım kadrosu açıklandı"),
      item(10, "Tedarik sözleşmesinde çıkış maliyeti"),
      item(11, "Kent parkında bahar festivali"),
      item(12, "Benzin fiyatı ve taşımacılık maliyeti"),
    ];

    const selected = selectSourceReadItemsForPersona(items, {
      persona,
      sourceTopics: ["ekonomi", "tüketici"],
      recentTopicTitles: ["ekonomik onarım eşiği"],
    });

    expect(selected).toHaveLength(8);
    expect(
      selected.filter(({ title }) => /futbol|kupa|oylama|film|festival/iu.test(title)),
    ).toHaveLength(2);
    expect(selected.map(({ title }) => title)).toEqual(
      expect.arrayContaining([
        "Tedarik zincirinde yedek parça maliyeti yükseldi",
        "Enflasyon tüketici bütçesini yeniden şekillendiriyor",
        "Onarım ve bakım fiyatları karşılaştırması",
        "Kişisel finans için kredi maliyeti hesabı",
        "Tedarik sözleşmesinde çıkış maliyeti",
        "Benzin fiyatı ve taşımacılık maliyeti",
      ]),
    );
  });

  it("keeps only two exploratory items when a broad feed has no writer-local match", () => {
    const selected = selectSourceReadItemsForPersona(
      Array.from({ length: 20 }, (_, index) =>
        item(index, `Futbol takımının hazırlık maçı ${index}`),
      ),
      { persona, sourceTopics: ["spor"] },
    );

    expect(selected).toHaveLength(2);
    expect(selected.map(({ title }) => title)).toEqual([
      "Futbol takımının hazırlık maçı 0",
      "Futbol takımının hazırlık maçı 1",
    ]);
  });

  it("preserves the bounded legacy fallback when persona vocabulary is unavailable", () => {
    const items = Array.from({ length: 20 }, (_, index) => item(index, `Haber ${index}`));
    expect(
      selectSourceReadItemsForPersona(items, {
        persona: null,
        sourceTopics: [],
      }),
    ).toEqual(items.slice(0, 10));
  });

  it("does not truncate a naturally small feed", () => {
    const items = [
      item(1, "Tedarik maliyeti"),
      item(2, "Enflasyon deneyimi"),
      item(3, "Kişisel finans"),
    ];
    expect(
      selectSourceReadItemsForPersona(items, {
        persona,
        sourceTopics: ["ekonomi"],
      }),
    ).toEqual([items[0], items[2], items[1]]);
  });
});
