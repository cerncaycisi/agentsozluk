import { describe, expect, it } from "vitest";
import { dictionaryAttentionTerms } from "@/modules/agents/repository/runtime";

/**
 * Dikkat terimleri, sözlük bağlantı adaylarının tek girdisidir: hangi mevcut
 * başlığın "komşu" sayılacağını bunlar belirler. Terim üretimi bozulursa aday
 * listesi sessizce boşalır, bu yüzden saf fonksiyon ayrıca doğrulanır.
 */
describe("dictionary attention terms", () => {
  it("reduces Turkish suffixes to a shared five-letter root", () => {
    const terms = dictionaryAttentionTerms([
      "uzaktan çalışmanın görünmeyen yönleri",
      "evden çalışırken hareket etmek",
    ]);
    const shared = terms.find(({ term }) => term === "çalış");
    expect(shared).toBeDefined();
    expect(shared?.sourceTitles).toEqual([
      "uzaktan çalışmanın görünmeyen yönleri",
      "evden çalışırken hareket etmek",
    ]);
  });

  it("drops short words and function-word roots", () => {
    const terms = dictionaryAttentionTerms([
      "iyi bir ekip toplantısı üzerine",
      "sabırlı olmayı öğrenmek",
    ]).map(({ term }) => term);
    expect(terms).toContain("topla");
    expect(terms).toContain("öğren");
    expect(terms).not.toContain("üzeri");
    expect(terms).not.toContain("olmay");
    expect(terms.every((term) => term.length === 5)).toBe(true);
  });

  it("spreads the budget across titles instead of draining it on the first", () => {
    const titles = Array.from({ length: 12 }, (_, index) => {
      const initial = "abcdefghijkl"[index]!;
      return `${initial}alfa1 ${initial}beta2 ${initial}delta ${initial}gamma`;
    });
    const terms = dictionaryAttentionTerms(titles);
    expect(terms).toHaveLength(20);
    // İlk turda her başlıktan bir terim alınmalı: on iki başlığın hepsi temsil edilir.
    const representedTitles = new Set(terms.flatMap(({ sourceTitles }) => sourceTitles));
    expect(representedTitles.size).toBe(12);
    // Hiçbir başlık üçten fazla terim veremez.
    for (const title of titles)
      expect(terms.filter(({ sourceTitles }) => sourceTitles.includes(title)).length).toBeLessThan(
        4,
      );
  });

  it("returns nothing when no visible title carries a content word", () => {
    expect(dictionaryAttentionTerms([])).toEqual([]);
    expect(dictionaryAttentionTerms(["ev", "kar", "göl"])).toEqual([]);
  });
});
