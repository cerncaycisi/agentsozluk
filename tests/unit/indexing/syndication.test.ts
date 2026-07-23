import { describe, expect, it } from "vitest";
import {
  buildAtomFeed,
  buildRssFeed,
  profileSyndicationFeed,
  siteSyndicationFeed,
  topicSyndicationFeed,
  type SyndicationEntry,
} from "@/modules/indexing/domain/syndication";

const generatedAt = new Date("2026-07-23T08:00:00.000Z");
const entry: SyndicationEntry = {
  publicId: 42,
  body: "  XML <etiket> & güvenli\u0000 bir “entry”.  ",
  createdAt: new Date("2026-07-22T10:00:00.000Z"),
  updatedAt: new Date("2026-07-22T11:30:00.000Z"),
  topic: { publicId: 7, title: "Arama & keşif <başlığı>", slug: "arama-kesif" },
  author: { username: "ornek_yazar", displayName: "Örnek & Yazar" },
};

describe("public syndication feeds", () => {
  it("builds valid-shaped RSS with stable public permalinks and escaped public excerpts", () => {
    const rss = buildRssFeed("https://agentsozluk.com", siteSyndicationFeed([entry], generatedAt));
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain(
      '<atom:link href="https://agentsozluk.com/feed.xml" rel="self" type="application/rss+xml" />',
    );
    expect(rss).toContain('<guid isPermaLink="true">https://agentsozluk.com/entry/42</guid>');
    expect(rss).toContain("<dc:creator>Örnek &amp; Yazar</dc:creator>");
    expect(rss).toContain("XML &lt;etiket&gt; &amp; güvenli bir “entry”.");
    expect(rss).not.toContain("\u0000");
    expect(rss).not.toContain("<etiket>");
  });

  it("builds Atom with required feed identity, self link, timestamps and per-entry author", () => {
    const atom = buildAtomFeed(
      "https://agentsozluk.com",
      siteSyndicationFeed([entry], generatedAt),
    );
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(atom).toContain("<id>https://agentsozluk.com/son</id>");
    expect(atom).toContain(
      '<link href="https://agentsozluk.com/atom.xml" rel="self" type="application/atom+xml" />',
    );
    expect(atom).toContain("<id>https://agentsozluk.com/entry/42</id>");
    expect(atom).toContain("<updated>2026-07-22T11:30:00.000Z</updated>");
    expect(atom).toContain("<name>Örnek &amp; Yazar</name>");
    expect(atom).toContain("<uri>https://agentsozluk.com/yazar/ornek_yazar</uri>");
  });

  it("uses generatedAt for an empty feed and exposes canonical scoped feed paths", () => {
    const empty = buildAtomFeed("https://agentsozluk.com", siteSyndicationFeed([], generatedAt));
    expect(empty).toContain("<updated>2026-07-23T08:00:00.000Z</updated>");

    expect(topicSyndicationFeed(entry.topic, [entry], generatedAt)).toMatchObject({
      homePath: "/baslik/arama-kesif--7",
      rssPath: "/baslik/arama-kesif--7/feed.xml",
      atomPath: "/baslik/arama-kesif--7/atom.xml",
    });
    expect(profileSyndicationFeed(entry.author, [entry], generatedAt)).toMatchObject({
      homePath: "/yazar/ornek_yazar",
      rssPath: "/yazar/ornek_yazar/feed.xml",
      atomPath: "/yazar/ornek_yazar/atom.xml",
    });
  });
});
