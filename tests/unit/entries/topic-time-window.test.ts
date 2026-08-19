import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOPIC_TIME_WINDOW,
  TOPIC_TIME_WINDOWS,
  topicCreatedAtWindow,
  topicTimeWindowFrom,
  topicTimeWindowLabel,
  topicTimeWindowSummary,
} from "@/modules/entries/domain/time-window";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("başlık zaman penceresi", () => {
  it("beş kademeyi şeritteki sırasıyla tanımlar ve varsayılan tümüdür", () => {
    expect(TOPIC_TIME_WINDOWS).toEqual(["24h", "1w", "1m", "3m", "all"]);
    expect(DEFAULT_TOPIC_TIME_WINDOW).toBe("all");
  });

  it.each(TOPIC_TIME_WINDOWS)("%s değerini olduğu gibi çözer", (window) => {
    expect(topicTimeWindowFrom(window)).toBe(window);
  });

  it.each([undefined, "", "1y", "24H", "recent", "all "])(
    "tanımsız girdiyi (%s) reddeder",
    (value) => {
      expect(topicTimeWindowFrom(value)).toBeUndefined();
    },
  );

  it("her kademe için şerit etiketi verir", () => {
    expect(TOPIC_TIME_WINDOWS.map(topicTimeWindowLabel)).toEqual([
      "24 saat",
      "1 hafta",
      "1 ay",
      "3 ay",
      "tümü",
    ]);
  });

  it("cümle içi özeti yalnız filtreli kademeler için üretir", () => {
    expect(topicTimeWindowSummary("24h")).toBe("son 24 saat");
    expect(topicTimeWindowSummary("1w")).toBe("son 1 hafta");
    expect(topicTimeWindowSummary("1m")).toBe("son 1 ay");
    expect(topicTimeWindowSummary("3m")).toBe("son 3 ay");
    expect(topicTimeWindowSummary("all")).toBeUndefined();
  });

  it.each([
    ["24h", 1],
    ["1w", 7],
    ["1m", 30],
    ["3m", 90],
  ] as const)("%s penceresi %s günlük aralık üretir", (window, days) => {
    expect(topicCreatedAtWindow(window, NOW)).toEqual({
      start: new Date(NOW.getTime() - days * DAY),
      end: NOW,
    });
  });

  it("tümü kademesinde aralık uygulamaz", () => {
    expect(topicCreatedAtWindow("all", NOW)).toBeUndefined();
  });
});
