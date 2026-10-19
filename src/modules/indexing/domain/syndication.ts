import { APP_NAME } from "@/config/app";
import { escapeXml } from "@/lib/http/xml";
import { entryPublicUrl, topicPublicUrl } from "@/lib/routing/public-urls";
import { entrySignalUrl } from "./entry-signal-cohort";
import { absolutePublicUrl, publicExcerpt, publicProfileUrl } from "./public-seo";

export interface SyndicationEntry {
  publicId: number;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  topic: {
    publicId: number;
    title: string;
    slug: string;
  };
  author: {
    username: string;
    displayName: string;
  };
  /** Entry'nin başlık sayfası (entry sinyal kohortu); bilinmiyorsa `/entry/N`'ye düşülür. */
  topicPage?: number | null;
}

export interface SyndicationFeed {
  title: string;
  description: string;
  homePath: string;
  rssPath: string;
  atomPath: string;
  entries: readonly SyndicationEntry[];
  generatedAt: Date;
}

/*
  Öğe KİMLİĞİ ile öğe BAĞLANTISI ayrı — entry sinyal kohortu, 19 Ekim 2026.

  RSS `guid` ve Atom `id` okuyucunun "bu öğeyi gördüm mü" anahtarıdır. Değişirse
  her okuyucu son 50 entry'yi yeni öğe sanıp yeniden gösterir. Sayfa numarası da
  kalıcı değil (bastırılan seed entry sayfa sınırını kaydırabilir), kimlik ona
  bağlanamaz. Bu yüzden kimlik her kohortta kalıcı
  `/entry/N` kalır (`isPermaLink="true"` hâlâ doğru: adres açılıyor). Yalnız
  `link`, deney kohortunda entry'nin başlıktaki asıl yerine gider.
*/
function entryIdentity(baseUrl: string, entry: SyndicationEntry): string {
  return absolutePublicUrl(baseUrl, entryPublicUrl(entry));
}

function entryLink(baseUrl: string, entry: SyndicationEntry): string {
  return absolutePublicUrl(
    baseUrl,
    entrySignalUrl({ topic: entry.topic, entry, page: entry.topicPage }),
  );
}

function authorName(entry: SyndicationEntry): string {
  return entry.author.displayName || `@${entry.author.username}`;
}

function feedUpdatedAt(feed: SyndicationFeed): Date {
  return (
    feed.entries.reduce<Date | null>(
      (latest, entry) => (!latest || entry.updatedAt > latest ? entry.updatedAt : latest),
      null,
    ) ?? feed.generatedAt
  );
}

export function buildRssFeed(baseUrl: string, feed: SyndicationFeed): string {
  const channelUrl = absolutePublicUrl(baseUrl, feed.homePath);
  const selfUrl = absolutePublicUrl(baseUrl, feed.rssPath);
  const items = feed.entries
    .map((entry) => {
      const topicUrl = absolutePublicUrl(baseUrl, topicPublicUrl(entry.topic));
      return [
        "<item>",
        `<title>${escapeXml(entry.topic.title)}</title>`,
        `<link>${escapeXml(entryLink(baseUrl, entry))}</link>`,
        `<guid isPermaLink="true">${escapeXml(entryIdentity(baseUrl, entry))}</guid>`,
        `<pubDate>${entry.createdAt.toUTCString()}</pubDate>`,
        `<dc:creator>${escapeXml(authorName(entry))}</dc:creator>`,
        `<category domain="${escapeXml(topicUrl)}">${escapeXml(entry.topic.title)}</category>`,
        `<description>${escapeXml(publicExcerpt(entry.body, 500))}</description>`,
        "</item>",
      ].join("");
    })
    .join("");

  return [
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ',
    'xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${escapeXml(feed.title)}</title>`,
    `<link>${escapeXml(channelUrl)}</link>`,
    `<description>${escapeXml(feed.description)}</description>`,
    "<language>tr-TR</language>",
    `<lastBuildDate>${feedUpdatedAt(feed).toUTCString()}</lastBuildDate>`,
    `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}

export function buildAtomFeed(baseUrl: string, feed: SyndicationFeed): string {
  const homeUrl = absolutePublicUrl(baseUrl, feed.homePath);
  const selfUrl = absolutePublicUrl(baseUrl, feed.atomPath);
  const entries = feed.entries
    .map((entry) => {
      return [
        "<entry>",
        `<title>${escapeXml(entry.topic.title)}</title>`,
        `<id>${escapeXml(entryIdentity(baseUrl, entry))}</id>`,
        `<link href="${escapeXml(entryLink(baseUrl, entry))}" rel="alternate" type="text/html" />`,
        `<published>${entry.createdAt.toISOString()}</published>`,
        `<updated>${entry.updatedAt.toISOString()}</updated>`,
        "<author>",
        `<name>${escapeXml(authorName(entry))}</name>`,
        `<uri>${escapeXml(absolutePublicUrl(baseUrl, publicProfileUrl(entry.author.username)))}</uri>`,
        "</author>",
        `<summary type="text">${escapeXml(publicExcerpt(entry.body, 500))}</summary>`,
        "</entry>",
      ].join("");
    })
    .join("");

  return [
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<title>${escapeXml(feed.title)}</title>`,
    `<subtitle>${escapeXml(feed.description)}</subtitle>`,
    `<id>${escapeXml(homeUrl)}</id>`,
    `<link href="${escapeXml(homeUrl)}" rel="alternate" type="text/html" />`,
    `<link href="${escapeXml(selfUrl)}" rel="self" type="application/atom+xml" />`,
    `<updated>${feedUpdatedAt(feed).toISOString()}</updated>`,
    entries,
    "</feed>",
  ].join("");
}

export function siteSyndicationFeed(
  entries: readonly SyndicationEntry[],
  generatedAt: Date,
): SyndicationFeed {
  return {
    title: `${APP_NAME} · Son entry’ler`,
    description: `${APP_NAME}’te yayımlanan son indexlenebilir entry’ler.`,
    homePath: "/son",
    rssPath: "/feed.xml",
    atomPath: "/atom.xml",
    entries,
    generatedAt,
  };
}

export function topicSyndicationFeed(
  topic: { title: string; slug: string; publicId: number },
  entries: readonly SyndicationEntry[],
  generatedAt: Date,
): SyndicationFeed {
  const homePath = topicPublicUrl(topic);
  return {
    title: `${topic.title} · ${APP_NAME}`,
    description: `${topic.title} başlığındaki son indexlenebilir entry’ler.`,
    homePath,
    rssPath: `${homePath}/feed.xml`,
    atomPath: `${homePath}/atom.xml`,
    entries,
    generatedAt,
  };
}

export function profileSyndicationFeed(
  profile: { username: string; displayName: string },
  entries: readonly SyndicationEntry[],
  generatedAt: Date,
): SyndicationFeed {
  const homePath = publicProfileUrl(profile.username);
  return {
    title: `${profile.displayName} · ${APP_NAME}`,
    description: `${profile.displayName} tarafından yayımlanan son indexlenebilir entry’ler.`,
    homePath,
    rssPath: `${homePath}/feed.xml`,
    atomPath: `${homePath}/atom.xml`,
    entries,
    generatedAt,
  };
}
