import { APP_NAME, PUBLIC_SITE_DESCRIPTION } from "@/config/app";
import { publicProfileSlug } from "@/modules/users/domain/public-identity";

type PublicAuthor = { username: string; displayName: string };

export function publicExcerpt(value: string, maxLength = 160): string {
  const normalized = value.normalize("NFKC").replaceAll(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  return `${characters
    .slice(0, Math.max(1, maxLength - 1))
    .join("")
    .trimEnd()}…`;
}

export function publicProfileUrl(username: string): string {
  return `/yazar/${encodeURIComponent(publicProfileSlug(username))}`;
}

export function absolutePublicUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export function publicAlternates(canonical: string, scopedFeedPath?: string) {
  const feedPath = scopedFeedPath ?? "";
  return {
    canonical,
    types: {
      "application/rss+xml": `${feedPath}/feed.xml`,
      "application/atom+xml": `${feedPath}/atom.xml`,
    },
  };
}

export function robotsForCanonicalView(
  base: { index: boolean; follow: boolean },
  hasViewParameters: boolean,
): { index: boolean; follow: boolean } {
  if (!base.index) return { index: false, follow: base.follow };
  return { index: !hasViewParameters, follow: true };
}

/*
  SAYFALAMA FACET DEĞİLDİR — 18 Eylül 2026.

  Başlık sayfası `page`i `sort`, `window`, `q` ile aynı kovaya koyuyordu ve
  hepsini noindex yapıp canonical'ı 1. sayfaya gösteriyordu. İkisi aynı şey değil:

  - `sort`/`window`/`q` AYNI entry'leri farklı sırada gösterir; özgün içerik yok.
    Bunlar noindex kalmalı, canonical temiz adresi göstermeli.
  - `page` ÖZGÜN içerik taşır. 75 entry'li bir başlıkta 20'den sonraki 55 entry
    yalnız orada; kanonik sayfa onları hiç içermiyor. Eski kurulumda o 55 entry'nin
    metni hiçbir indekslenen başlık sayfasında yoktu (canlı ölçüm, 18 Eylül).

  Ayrıca `canonical`ı başka bir adrese gösteren sayfaya `noindex` koymak Google'ın
  açıkça uyardığı kalıp: noindex canonical hedefine taşınabilir ve hedef burada
  BAŞLIĞIN KENDİSİ. Sayfalanan sayfa artık kendine canonical verir ve indekslenir.
*/
export function paginatedCanonical(baseUrl: string, page: number): string {
  return page > 1 ? `${baseUrl}?page=${page}` : baseUrl;
}

export function robotsForPaginatedView(
  base: { index: boolean; follow: boolean },
  hasFacetParameters: boolean,
): { index: boolean; follow: boolean } {
  if (!base.index) return { index: false, follow: base.follow };
  return { index: !hasFacetParameters, follow: true };
}

export function safeSerializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function authorData(baseUrl: string, author: PublicAuthor) {
  return {
    "@type": "Person",
    name: author.displayName,
    url: absolutePublicUrl(baseUrl, publicProfileUrl(author.username)),
  };
}

function websiteData(baseUrl: string) {
  return { "@type": "WebSite", name: APP_NAME, url: absolutePublicUrl(baseUrl, "/") };
}

export function buildWebsiteJsonLd(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    ...websiteData(baseUrl),
    "@id": absolutePublicUrl(baseUrl, "/#website"),
    description: PUBLIC_SITE_DESCRIPTION,
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: `${absolutePublicUrl(baseUrl, "/ara")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildTopicJsonLd(input: {
  baseUrl: string;
  url: string;
  title: string;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
  author: PublicAuthor;
  entries: Array<{
    url: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    author: PublicAuthor;
  }>;
}) {
  const url = absolutePublicUrl(input.baseUrl, input.url);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: input.title,
    dateCreated: input.createdAt.toISOString(),
    dateModified: input.updatedAt.toISOString(),
    creator: authorData(input.baseUrl, input.author),
    isPartOf: websiteData(input.baseUrl),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.entryCount,
      itemListElement: input.entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "DiscussionForumPosting",
          "@id": absolutePublicUrl(input.baseUrl, entry.url),
          url: absolutePublicUrl(input.baseUrl, entry.url),
          headline: input.title,
          text: entry.body,
          datePublished: entry.createdAt.toISOString(),
          dateModified: entry.updatedAt.toISOString(),
          author: authorData(input.baseUrl, entry.author),
        },
      })),
    },
  };
}

export function buildEntryJsonLd(input: {
  baseUrl: string;
  url: string;
  topicUrl: string;
  topicTitle: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: PublicAuthor;
}) {
  const url = absolutePublicUrl(input.baseUrl, input.url);
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": url,
    url,
    headline: input.topicTitle,
    text: input.body,
    datePublished: input.createdAt.toISOString(),
    dateModified: input.updatedAt.toISOString(),
    author: authorData(input.baseUrl, input.author),
    isPartOf: {
      "@type": "CollectionPage",
      name: input.topicTitle,
      url: absolutePublicUrl(input.baseUrl, input.topicUrl),
    },
  };
}

export function buildProfileJsonLd(input: {
  baseUrl: string;
  username: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
}) {
  const url = absolutePublicUrl(input.baseUrl, publicProfileUrl(input.username));
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": url,
    url,
    dateCreated: input.createdAt.toISOString(),
    mainEntity: {
      "@type": "Person",
      name: input.displayName,
      url,
      ...(input.bio ? { description: publicExcerpt(input.bio, 300) } : {}),
    },
  };
}
