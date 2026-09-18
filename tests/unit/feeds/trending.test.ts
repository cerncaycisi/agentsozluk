import { describe, expect, it } from "vitest";
import { boundedFeedWindow, topicFeedWindowStart } from "@/modules/feeds/domain/feed";
import { calculateTrendScore } from "@/modules/feeds/domain/trending";
import { topicFeedSchema } from "@/modules/feeds/validation/schemas";

describe("trend score", () => {
  it("implements the locked weighted formula", () => {
    expect(
      calculateTrendScore({
        activeEntryCount: 3,
        uniqueAuthorCount: 2,
        positiveVotes: 4,
        negativeVotes: 1,
        hoursSinceLastActiveEntry: 2.9,
      }),
    ).toBe(60);
  });

  it("never adds negative recency", () => {
    expect(
      calculateTrendScore({
        activeEntryCount: 0,
        uniqueAuthorCount: 0,
        positiveVotes: 0,
        negativeVotes: 0,
        hoursSinceLastActiveEntry: 30,
      }),
    ).toBe(0);
  });

  it("caps a feed at 30 records and validates feed names", () => {
    /*
      18 Eylül 2026: TOPLAM sınır kaldırıldı. Eskiden `(25,20)` → take 5 ve
      `(30,20)` → take 0 dönüyordu; akış 30. başlıkta bitiyordu.

      İddialar sabiti DEĞİL düz sayıyı yazar. Astra (18 Eylül) ölçtü: sabiti
      beklenti olarak kullanan sürümde `MAX_PAGE_SIZE`'ı 50'den 60'a çıkaran
      mutasyon 12/12 geçiyordu — test sınırı korumuyordu, tanımlıyordu.
    */
    expect(boundedFeedWindow(25, 20)).toEqual({ skip: 25, take: 20 });
    expect(boundedFeedWindow(30, 20)).toEqual({ skip: 30, take: 20 });
    expect(boundedFeedWindow(5_000, 20)).toEqual({ skip: 5_000, take: 20 });

    // Emniyet duruyor ve genel `MAX_PAGE_SIZE` ile AYNI: 100.
    expect(boundedFeedWindow(0, 500)).toEqual({ skip: 0, take: 100 });
    expect(boundedFeedWindow(0, 100)).toEqual({ skip: 0, take: 100 });
    expect(boundedFeedWindow(-5, -5)).toEqual({ skip: 0, take: 0 });

    /*
      Derinlik aşımı akışı BİTİRİR, tekrarlamaz. Eski kelepçe `skip`i sınıra
      çekiyordu ve 501, 502… sayfaları aynı kayıtları gösteriyordu.
    */
    expect(boundedFeedWindow(1_000_000, 20)).toEqual({ skip: 1_000_000, take: 20 });
    expect(boundedFeedWindow(1_000_001, 20).take).toBe(0);
    expect(boundedFeedWindow(9_000_000, 20).take).toBe(0);
    expect(topicFeedSchema.parse("trending")).toBe("trending");
    expect(topicFeedSchema.safeParse("unknown").success).toBe(false);
    expect(topicFeedWindowStart("trending", new Date("2026-07-17T12:00:00.000Z"))).toEqual(
      new Date("2026-07-16T12:00:00.000Z"),
    );
  });
});
