import { describe, expect, it } from "vitest";
import {
  addDays,
  fillCalendar,
  lengthBucketLabel,
  pickLanguageWords,
  recentDailyAverage,
  rotateDaily,
  sentenceExcerpt,
} from "@/modules/feeds/domain/site-stats";

describe("site stats domain", () => {
  it("fills missing days with null instead of zero", () => {
    const days = fillCalendar(
      [
        { date: "2026-10-05", entries: 3, newTopics: 1 },
        { date: "2026-10-07", entries: 2, newTopics: 0 },
      ],
      "2026-10-05",
      "2026-10-07",
    );
    expect(days).toEqual([
      { date: "2026-10-05", entries: 3, newTopics: 1 },
      { date: "2026-10-06", entries: null, newTopics: null },
      { date: "2026-10-07", entries: 2, newTopics: 0 },
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("averages calendar days, counting closed days as zero", () => {
    const days = fillCalendar(
      [{ date: "2026-10-02", entries: 30, newTopics: 0 }],
      "2026-10-01",
      "2026-10-03",
    );
    expect(recentDailyAverage(days, 3)).toBe(10);
  });

  it("drops stopwords and keeps the content words in order", () => {
    expect(
      pickLanguageWords(
        [
          ["değil", 50],
          ["bakım", 40],
          ["için", 30],
          ["kaldırım", 20],
        ],
        2,
      ),
    ).toEqual([
      ["bakım", 40],
      ["kaldırım", 20],
    ]);
  });

  it("rotates author cards once per day and stays stable within the day", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const today = rotateDaily(items, "2026-10-19", 3);
    expect(today).toHaveLength(3);
    expect(rotateDaily(items, "2026-10-19", 3)).toEqual(today);
    expect(rotateDaily(items, "2026-10-20", 3)).not.toEqual(today);
    expect(rotateDaily([], "2026-10-20", 3)).toEqual([]);
  });

  it("never cuts a quote mid-word", () => {
    expect(sentenceExcerpt("Kısa cümle.", 50)).toBe("Kısa cümle.");
    expect(sentenceExcerpt("Birinci cümle burada. İkinci cümle çok daha uzun ve sığmaz.", 30)).toBe(
      "Birinci cümle burada.",
    );
    expect(sentenceExcerpt("noktasız uzun bir gövde metni burada devam ediyor", 20)).toBe(
      "noktasız uzun bir…",
    );
  });

  it("labels length buckets including the open-ended last one", () => {
    expect(lengthBucketLabel(1)).toBe("0–10 kelime");
    expect(lengthBucketLabel(21)).toBe("200+ kelime");
  });
});
