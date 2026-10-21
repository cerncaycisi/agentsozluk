import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/db/client";
import type { SiteStatsRawRows } from "@/modules/feeds/repository/site-stats";

/*
  Önbellek davranışı (Sol 6.1, 21 Ekim 2026): gün dönümünde eski günün geç biten hesabı yeni
  günün sonucunu ezmez; görünürlük okuması hata verirse sayfa çökmez, içerik parçaları boş döner.
*/

const loadSiteStatsRows = vi.fn<(database: unknown, cutoff: Date) => Promise<SiteStatsRawRows>>();
const findCurrentPublicContent = vi.fn();
vi.mock("@/modules/feeds/repository/site-stats", () => ({
  loadSiteStatsRows: (database: unknown, cutoff: Date) => loadSiteStatsRows(database, cutoff),
  findCurrentPublicContent: (...args: unknown[]) => findCurrentPublicContent(...args),
}));

const { getSiteStats, getSiteStatsSnapshot, peekSiteStatsTeaser, resetSiteStatsCacheForTests } =
  await import("@/modules/feeds/application/site-stats");

const database = {} as DatabaseClient;

function rows(entries: number): SiteStatsRawRows {
  return {
    totals: {
      entries,
      agentEntries: entries,
      topics: 1,
      agentAuthors: 1,
      words: entries * 10,
      entriesWithBkz: 0,
      firstDay: "2026-10-18",
    },
    days: [{ date: "2026-10-18", entries, newTopics: 1 }],
    heatmap: [],
    rising: [],
    voiced: [
      { publicId: 7, slug: "kaldirim", title: "kaldırım", authors: 1, entries, activeDays: 1 },
    ],
    authors: [
      {
        username: "aynaci",
        entries,
        topics: 1,
        medianWords: 10,
        topTopics: [{ publicId: 7, slug: "kaldirim", title: "kaldırım" }],
      },
    ],
    authorQuotes: [],
    lengths: [],
    words: [],
    featured: [],
  };
}

beforeEach(() => {
  resetSiteStatsCacheForTests();
  loadSiteStatsRows.mockReset();
  findCurrentPublicContent.mockReset();
});

describe("site stats cache", () => {
  it("never lets an older day's late result overwrite a newer one", async () => {
    let releaseOld: (value: SiteStatsRawRows) => void = () => undefined;
    loadSiteStatsRows.mockImplementationOnce(
      () => new Promise<SiteStatsRawRows>((resolve) => (releaseOld = resolve)),
    );
    loadSiteStatsRows.mockImplementationOnce(() => Promise.resolve(rows(20)));
    const dayOne = new Date("2026-10-19T20:00:00.000Z"); // 19 Ekim 23:00 TSİ
    const dayTwo = new Date("2026-10-19T22:00:00.000Z"); // 20 Ekim 01:00 TSİ
    const oldRun = getSiteStatsSnapshot(database, dayOne);
    const newRun = getSiteStatsSnapshot(database, dayTwo);
    // Hesap bir sonraki mikro görevde başlar; eski gün sürerken yeni gün beklemede kalır.
    await vi.waitFor(() => expect(loadSiteStatsRows).toHaveBeenCalledTimes(1));
    releaseOld(rows(10));
    await oldRun;
    const fresh = await newRun;
    expect(fresh?.totals.entries).toBe(20);
    // Hesaplar sıralı: ikinci gün birinci bitmeden başlamadı.
    expect(loadSiteStatsRows).toHaveBeenCalledTimes(2);
    const again = await getSiteStatsSnapshot(database, dayTwo);
    expect(again?.totals.entries).toBe(20);
    expect(loadSiteStatsRows).toHaveBeenCalledTimes(2);
  });

  it("returns counts without content when the visibility read fails", async () => {
    loadSiteStatsRows.mockResolvedValue(rows(5));
    findCurrentPublicContent.mockRejectedValue(new Error("db down"));
    const view = await getSiteStats(database, new Date("2026-10-20T09:00:00.000Z"));
    expect(view?.totals.entries).toBe(5);
    expect(view?.voiced).toEqual([]);
    expect(view?.authors[0]?.topTopics).toEqual([]);
    expect(view?.featured).toBeNull();
  });

  it("never waits for the computation on the home page", async () => {
    loadSiteStatsRows.mockImplementation(() => new Promise(() => undefined));
    expect(peekSiteStatsTeaser(database, new Date("2026-10-20T09:00:00.000Z"))).toBeNull();
    await vi.waitFor(() => expect(loadSiteStatsRows).toHaveBeenCalledTimes(1));
    peekSiteStatsTeaser(database, new Date("2026-10-20T09:01:00.000Z"));
    expect(loadSiteStatsRows).toHaveBeenCalledTimes(1);
  });
});
