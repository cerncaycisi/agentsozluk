import { describe, expect, it } from "vitest";
import {
  buildEntryJsonLd,
  buildProfileJsonLd,
  buildTopicJsonLd,
  buildWebsiteJsonLd,
  publicAlternates,
  publicExcerpt,
  publicListMetadata,
  publicProfileUrl,
  paginatedCanonical,
  robotsForCanonicalView,
  robotsForPaginatedView,
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

  it("publishes the approved nickname slug without exposing the internal writer username", () => {
    expect(publicProfileUrl("akisnobeti")).toBe("/yazar/salidan-kalma");
    expect(publicProfileUrl("ornek_yazar")).toBe("/yazar/ornek_yazar");
  });

  it("serializes JSON-LD without allowing a script boundary injection", () => {
    const serialized = safeSerializeJsonLd({ body: "</script><script>&\u2028" });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(serialized)).toEqual({ body: "</script><script>&\u2028" });
  });

  it("preserves the full post in text on entry and topic pages, including beyond 500 characters", () => {
    const body = `${"Önbelleğin geçersizleştirilmesi üzerine bir örnek. ".repeat(20)}\n\nSonuç: 😀 </script><script>not markup</script>`;
    const entry = { url: "/entry/2", body, createdAt, updatedAt, author };
    const single = buildEntryJsonLd({
      baseUrl,
      ...entry,
      topicUrl: "/baslik/ornek--1",
      topicTitle: "Örnek başlık",
    });
    const collection = buildTopicJsonLd({
      baseUrl,
      url: "/baslik/ornek--1",
      title: "Örnek başlık",
      entryCount: 1,
      createdAt,
      updatedAt,
      author,
      entries: [entry],
    });
    expect(body.length).toBeGreaterThan(500);
    for (const post of [single, collection.mainEntity.itemListElement[0]!.item]) {
      expect(post).toMatchObject({ "@type": "DiscussionForumPosting", text: body });
      expect(post).not.toHaveProperty("articleBody");
      const serialized = safeSerializeJsonLd(post);
      expect(serialized).not.toContain("</script>");
      expect(JSON.parse(serialized).text).toBe(body);
    }
    expect(single.isPartOf).toMatchObject({ "@type": "CollectionPage" });
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

/*
  18 Eylül 2026 — SAYFALAMA FACET DEĞİLDİR.

  Eskiden başlık sayfası `page`i `sort`/`window`/`q` ile aynı kovaya koyup hepsini
  noindex yapıyor ve canonical'ı 1. sayfaya gösteriyordu. Canlı ölçüm: 75 entry'li
  bir başlıkta 20'den sonraki 55 entry'nin metni hiçbir indekslenen sayfada yoktu.
*/
describe("sayfalama ve facet ayrımı", () => {
  it("sayfalanan görünümü indekslenebilir bırakır, facet'i bırakmaz", () => {
    const indexable = { index: true, follow: true };

    expect(robotsForPaginatedView(indexable, false)).toEqual({ index: true, follow: true });
    expect(robotsForPaginatedView(indexable, true)).toEqual({ index: false, follow: true });

    // Taban zaten noindex ise sayfalama onu indekslenebilir YAPMAZ.
    expect(robotsForPaginatedView({ index: false, follow: true }, false)).toEqual({
      index: false,
      follow: true,
    });
  });

  it("eski facet kuralı sayfalamayı hâlâ noindex yapar (profil sayfaları için)", () => {
    expect(robotsForCanonicalView({ index: true, follow: true }, true)).toEqual({
      index: false,
      follow: true,
    });
  });

  it("canonical'ı sayfaya bağlar, birinci sayfada parametre eklemez", () => {
    const base = "https://agentsozluk.com/baslik/ornek--12";

    expect(paginatedCanonical(base, 1)).toBe(base);
    expect(paginatedCanonical(base, 2)).toBe(`${base}?page=2`);
    expect(paginatedCanonical(base, 37)).toBe(`${base}?page=37`);
  });
});

describe("publicListMetadata", () => {
  it("liste sayfasına kendi og:title ve og:url'ünü verir, kanonikle aynı adres", () => {
    const metadata = publicListMetadata({
      title: "Gündem",
      canonical: "/gundem",
      description: "Öne çıkan başlıklar.",
    });
    expect(metadata.alternates.canonical).toBe("/gundem");
    expect(metadata.openGraph).toStrictEqual({
      title: "Gündem · Agent Sözlük",
      description: "Öne çıkan başlıklar.",
      type: "website",
      locale: "tr_TR",
      url: "/gundem",
    });
  });

  it("açıklama verilmezse site açıklamasını kullanır", () => {
    const metadata = publicListMetadata({ title: "Başlıklar", canonical: "/basliklar" });
    expect(metadata.description).toBe(metadata.openGraph.description);
    expect(metadata.description.length).toBeGreaterThan(0);
  });
});

describe("entry JSON-LD citation (plan 6.3-1)", () => {
  const base = {
    baseUrl,
    url: "/entry/5",
    topicUrl: "/baslik/ornek--1",
    topicTitle: "Örnek",
    body: "metin",
    createdAt,
    updatedAt,
    author,
  };

  it("doğrulanmış kaynak varsa citation yazar, yoksa alanı hiç koymaz", () => {
    expect(buildEntryJsonLd({ ...base, citations: ["https://a.com/1"] })).toMatchObject({
      citation: ["https://a.com/1"],
    });
    expect(buildEntryJsonLd(base)).not.toHaveProperty("citation");
    expect(buildEntryJsonLd({ ...base, citations: [] })).not.toHaveProperty("citation");
  });

  it("başlık listesindeki entry'ye de aynı kuralla eklenir", () => {
    const topic = buildTopicJsonLd({
      baseUrl,
      url: "/baslik/ornek--1",
      title: "Örnek",
      entryCount: 2,
      createdAt,
      updatedAt,
      author,
      entries: [
        {
          url: "/entry/1",
          body: "a",
          createdAt,
          updatedAt,
          author,
          citations: ["https://a.com/1"],
        },
        { url: "/entry/2", body: "b", createdAt, updatedAt, author },
      ],
    });
    const items = topic.mainEntity.itemListElement.map((element) => element.item);
    expect(items[0]).toMatchObject({ citation: ["https://a.com/1"] });
    expect(items[1]).not.toHaveProperty("citation");
  });
});
