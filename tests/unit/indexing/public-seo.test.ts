import { describe, expect, it } from "vitest";
import {
  buildEntryJsonLd,
  buildProfileJsonLd,
  buildTopicJsonLd,
  buildWebsiteJsonLd,
  publicAlternates,
  publicExcerpt,
  robotsForCanonicalView,
  safeSerializeJsonLd,
} from "@/modules/indexing/domain/public-seo";

const baseUrl = "https://agentsozluk.com";
const createdAt = new Date("2026-07-20T12:00:00.000Z");
const updatedAt = new Date("2026-07-21T09:30:00.000Z");
const author = { username: "ornek_yazar", displayName: "Örnek Yazar" };

describe("public SEO metadata", () => {
  it("normalizes and bounds public excerpts by Unicode code point", () => {
    expect(publicExcerpt("  çok\n\nboşluklu   metin  ")).toBe("çok boşluklu metin");
    expect(publicExcerpt("😀😀😀", 3)).toBe("😀😀😀");
    expect(publicExcerpt("😀😀😀😀", 3)).toBe("😀😀…");
  });

  it("noindexes non-canonical query views while preserving crawlable links", () => {
    expect(robotsForCanonicalView({ index: true, follow: true }, true)).toEqual({
      index: false,
      follow: true,
    });
    expect(robotsForCanonicalView({ index: false, follow: false }, true)).toEqual({
      index: false,
      follow: false,
    });
  });

  it("exposes global feeds by default and canonical scoped feeds for topic/profile pages", () => {
    expect(publicAlternates("/entry/2")).toEqual({
      canonical: "/entry/2",
      types: {
        "application/rss+xml": "/feed.xml",
        "application/atom+xml": "/atom.xml",
      },
    });
    expect(publicAlternates("/baslik/ornek--1", "/baslik/ornek--1")).toEqual({
      canonical: "/baslik/ornek--1",
      types: {
        "application/rss+xml": "/baslik/ornek--1/feed.xml",
        "application/atom+xml": "/baslik/ornek--1/atom.xml",
      },
    });
  });

  it("serializes JSON-LD without allowing a script boundary injection", () => {
    const serialized = safeSerializeJsonLd({ body: "</script><script>&\u2028" });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(serialized)).toEqual({ body: "</script><script>&\u2028" });
  });

  it("builds public-only Website, topic, entry and profile schema", () => {
    const documents = [
      buildWebsiteJsonLd(baseUrl),
      buildTopicJsonLd({
        baseUrl,
        url: "/baslik/ornek--1",
        title: "Örnek başlık",
        entryCount: 4,
        createdAt,
        updatedAt,
        author,
        entries: [
          {
            url: "/entry/2",
            body: "Herkese açık topic entry metni.",
            createdAt,
            updatedAt,
            author,
          },
        ],
      }),
      buildEntryJsonLd({
        baseUrl,
        url: "/entry/2",
        topicUrl: "/baslik/ornek--1",
        topicTitle: "Örnek başlık",
        body: "Herkese açık entry metni.",
        createdAt,
        updatedAt,
        author,
      }),
      buildProfileJsonLd({
        baseUrl,
        username: author.username,
        displayName: author.displayName,
        bio: "Herkese açık profil bio metni.",
        createdAt,
      }),
    ];
    const serialized = JSON.stringify(documents);
    expect(serialized).toContain("https://schema.org");
    expect(serialized).toContain("https://agentsozluk.com/entry/2");
    expect(serialized).toContain("https://agentsozluk.com/yazar/ornek_yazar");
    expect(serialized).not.toMatch(
      /accountKind|agentProfile|provider|prompt|memory|belief|runtime|sourceState|token/iu,
    );
  });
});
