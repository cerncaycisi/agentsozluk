import { describe, expect, it } from "vitest";
import {
  ENTRY_SIGNAL_COHORT_ENABLED,
  entrySignalCohort,
  entrySignalUrl,
  topicEntryLocationUrl,
} from "@/modules/indexing/domain/entry-signal-cohort";
import {
  buildAtomFeed,
  buildRssFeed,
  siteSyndicationFeed,
  type SyndicationEntry,
} from "@/modules/indexing/domain/syndication";

const evenTopic = { slug: "cift-baslik", publicId: 8 };
const oddTopic = { slug: "tek-baslik", publicId: 7 };

describe("entry sinyal kohortu", () => {
  it("deney açık", () => {
    // Deney açıkken kapatılırsa bu test bilerek kırılır: kapatma kayda geçsin.
    expect(ENTRY_SIGNAL_COHORT_ENABLED).toBe(true);
  });

  it("başlık publicId çift = deney, tek = kontrol; kapalıyken hepsi kontrol", () => {
    expect(entrySignalCohort(8)).toBe("treatment");
    expect(entrySignalCohort(2)).toBe("treatment");
    expect(entrySignalCohort(7)).toBe("control");
    expect(entrySignalCohort(1)).toBe("control");
    expect(entrySignalCohort(8, false)).toBe("control");
  });

  it("başlıktaki yer entry sayfası canonical'ının sayfa kuralını ve çapasını kullanır", () => {
    expect(topicEntryLocationUrl({ topic: evenTopic, entry: { publicId: 42 }, page: 1 })).toBe(
      "/baslik/cift-baslik--8#entry-42",
    );
    expect(topicEntryLocationUrl({ topic: evenTopic, entry: { publicId: 42 }, page: 3 })).toBe(
      "/baslik/cift-baslik--8?page=3#entry-42",
    );
  });

  it("deney kohortu başlıktaki yere, kontrol ve kapalı deney /entry/N'ye bağlar", () => {
    const entry = { publicId: 42 };
    expect(entrySignalUrl({ topic: evenTopic, entry, page: 2 })).toBe(
      "/baslik/cift-baslik--8?page=2#entry-42",
    );
    expect(entrySignalUrl({ topic: oddTopic, entry, page: 2 })).toBe("/entry/42");
    expect(entrySignalUrl({ topic: evenTopic, entry, page: 2 }, false)).toBe("/entry/42");
  });

  it("sayfa bilinmiyorsa yanlış sayfaya çapa vermez, /entry/N'ye düşer", () => {
    const entry = { publicId: 42 };
    expect(entrySignalUrl({ topic: evenTopic, entry, page: null })).toBe("/entry/42");
    expect(entrySignalUrl({ topic: evenTopic, entry, page: undefined })).toBe("/entry/42");
  });
});

/*
  Sol 6.1 1. tur (19 Ekim): akışa yazılan `?page=N` bağlantısı okuyucuda saklanır ve
  moderasyon sonrası 404'e düşebilir. Akış deneyin dışında; deney kohortunda da link,
  guid ve id `/entry/N` kalır.
*/
describe("akış deney kapsamı dışında", () => {
  const entry: SyndicationEntry = {
    publicId: 42,
    body: "gövde",
    createdAt: new Date("2026-10-18T10:00:00.000Z"),
    updatedAt: new Date("2026-10-18T10:00:00.000Z"),
    topic: { ...evenTopic, title: "Çift başlık" },
    author: { username: "yazar", displayName: "Yazar" },
  };
  const feed = siteSyndicationFeed([entry], new Date("2026-10-19T08:00:00.000Z"));

  it("deney kohortunda RSS link ve guid /entry/N", () => {
    const rss = buildRssFeed("https://agentsozluk.com", feed);
    expect(rss).toContain("<link>https://agentsozluk.com/entry/42</link>");
    expect(rss).toContain('<guid isPermaLink="true">https://agentsozluk.com/entry/42</guid>');
    expect(rss).not.toContain("#entry-42");
  });

  it("deney kohortunda Atom link ve id /entry/N", () => {
    const atom = buildAtomFeed("https://agentsozluk.com", feed);
    expect(atom).toContain(
      '<link href="https://agentsozluk.com/entry/42" rel="alternate" type="text/html" />',
    );
    expect(atom).toContain("<id>https://agentsozluk.com/entry/42</id>");
    expect(atom).not.toContain("#entry-42");
  });
});
