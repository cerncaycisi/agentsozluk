import { describe, expect, it } from "vitest";
import {
  createInterestScorer,
  interestTokens,
  selectWithInterestRotation,
} from "@/modules/agents/domain/interest-matching";

describe("Türkçe ilgi eşleştirmesi", () => {
  it("bağlaçları, edatları, durak kelimelerini ve kısa parçaları atar", () => {
    expect(
      interestTokens(
        "film ve ile veya ya da de için gibi bir bu şu o ki mi ama en çok daha diziler",
      ),
    ).toEqual(["film", "diziler"]);
    const score = createInterestScorer([{ key: "film ve diziler", weight: 1 }]);
    expect(score("masa ve sandalye")).toBe(0);
    expect(score("film")).toBe(0.5);
    expect(score("film ve diziler")).toBe(1);
    expect(createInterestScorer([{ key: "ve ya da", weight: 1 }])("ve ya da")).toBe(0);
  });

  it.each(["müzikal", "müziği", "MÜZİĞİN", "müzikler", "(müzik)"])(
    "müzik ilgisini %s ile eşleştirir",
    (text) => expect(createInterestScorer([{ key: "müzik", weight: 0.8 }])(text)).toBe(0.8),
  );

  it("kelime içindeki alt dizelere ve üç harfli kökün uzantılarına puan vermez", () => {
    const score = createInterestScorer([
      { key: "film", weight: 0.7 },
      { key: "din", weight: 0.3 },
    ]);
    expect(score("mikrofilm dinamik")).toBe(0);
    expect(score("filmde din")).toBe(1);
    expect(createInterestScorer([{ key: "müzik", weight: 1 }])("müziğraf")).toBe(0);
  });

  it("gündelik hayat ilgisini eşleşen parçaların oranıyla ve tekrar saymadan puanlar", () => {
    const score = createInterestScorer([{ key: "gündelik hayat", weight: 0.8 }]);
    expect(score("gündelik işler")).toBe(0.4);
    expect(score("hayatın akışı")).toBe(0.4);
    expect(score("gündelik hayatta")).toBe(0.8);
    expect(score("gündelik gündelik gündelik")).toBe(0.4);
    expect(interestTokens("FİLM, film!")).toEqual(["film"]);
  });
});

describe("ilgi ile dönüşüm sırasının birleşmesi", () => {
  it("ilk yarıyı ilgiyle seçer ve kalanında eski sırayı tekrarsız korur", () => {
    const candidates = [0, 1, 2, 3, 4, 5];
    expect(selectWithInterestRotation(candidates, 4, (item) => item)).toEqual([5, 4, 0, 1]);
    expect(candidates).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("ilgi yoksa dönüşümü aynen bırakır, sınırları ve eşitlik sırasını korur", () => {
    expect(selectWithInterestRotation([1, 2, 3], 2, () => 0)).toEqual([1, 2]);
    expect(selectWithInterestRotation([1, 2, 3], 2, () => 1)).toEqual([1, 2]);
    expect(selectWithInterestRotation([1, 2], 4, (item) => item)).toEqual([2, 1]);
    expect(selectWithInterestRotation([1], 0, () => 1)).toEqual([]);
    expect(() => selectWithInterestRotation([], -1, () => 0)).toThrow(RangeError);
  });
});
