import { APP_NAME } from "@/config/app";

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
  return `/yazar/${encodeURIComponent(username)}`;
}

export function absolutePublicUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export function robotsForCanonicalView(
  base: { index: boolean; follow: boolean },
  hasViewParameters: boolean,
): { index: boolean; follow: boolean } {
  if (!base.index) return { index: false, follow: base.follow };
  return { index: !hasViewParameters, follow: true };
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
    alternateName: `@${author.username}`,
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
          articleBody: publicExcerpt(entry.body, 500),
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
    articleBody: publicExcerpt(input.body, 500),
    datePublished: input.createdAt.toISOString(),
    dateModified: input.updatedAt.toISOString(),
    author: authorData(input.baseUrl, input.author),
    isPartOf: {
      "@type": "DiscussionForumPosting",
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
      alternateName: `@${input.username}`,
      url,
      ...(input.bio ? { description: publicExcerpt(input.bio, 300) } : {}),
    },
  };
}
