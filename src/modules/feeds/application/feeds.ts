import type { DatabaseClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { currentIstanbulDayWindow, previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import {
  boundedFeedWindow,
  HOME_SAMPLER_BLOCK_COUNT,
  homeSamplerTopicCandidateCount,
  TOPIC_FEED_MAX_ITEMS,
  topicFeedWindowStart,
  type TopicFeed,
} from "@/modules/feeds/domain/feed";
import {
  findRandomActiveTopic,
  listChronologicalTopics,
  listDebeEntries,
  listScoredTopics,
  listTopEntryPerTopic,
  listWindowedChronologicalTopics,
} from "@/modules/feeds/repository/feeds";
import { withEntryCounters } from "@/modules/entries/domain/entry";
import { topicPublicUrl } from "@/lib/routing/public-urls";

export type { TopicFeed } from "@/modules/feeds/domain/feed";

export interface TopicFeedItem {
  id: string;
  publicId: number;
  title: string;
  slug: string;
  entryCount: number;
  lastEntryAt: Date | null;
  createdAt: Date;
  activeEntryCount?: number;
  uniqueAuthorCount?: number;
  positiveVotes?: number;
  negativeVotes?: number;
  trendScore?: number;
}

export async function getTopicFeed(
  client: DatabaseClient,
  input: {
    feed: TopicFeed;
    page: number;
    pageSize: number;
    skip: number;
    now?: Date;
    window?: "24h";
  },
): Promise<{ topics: TopicFeedItem[]; totalItems: number }> {
  const now = input.now ?? new Date();
  const { skip, take } = boundedFeedWindow(input.skip, input.pageSize);
  const windowStart = topicFeedWindowStart("trending", now);

  if (input.feed === "recent" || input.feed === "new") {
    const mode = input.feed;
    const result = await client.$transaction((transaction) =>
      input.window === "24h"
        ? listWindowedChronologicalTopics(transaction, { mode, windowStart, now, skip, take })
        : listChronologicalTopics(transaction, { mode, skip, take }),
    );
    return {
      topics: result.topics,
      totalItems: Math.min(result.totalItems, TOPIC_FEED_MAX_ITEMS),
    };
  }

  const scoredWindowStart =
    input.feed === "popular"
      ? currentIstanbulDayWindow(now).start
      : topicFeedWindowStart(input.feed, now);
  const result = await client.$transaction((transaction) =>
    listScoredTopics(transaction, {
      windowStart: scoredWindowStart,
      now,
      skip,
      take,
      activityOnly: input.window === "24h" && input.feed === "trending",
    }),
  );
  return {
    topics: result.topics,
    totalItems: Math.min(result.totalItems, TOPIC_FEED_MAX_ITEMS),
  };
}

export async function getDebe(client: DatabaseClient, now = new Date()) {
  const window = previousIstanbulDayWindow(now);
  const entries = await client.$transaction((transaction) => listDebeEntries(transaction, window));
  return entries.map(withEntryCounters);
}

export async function getRandomTopic(client: DatabaseClient, randomKey = Math.random()) {
  const topic = await client.$transaction((transaction) =>
    findRandomActiveTopic(transaction, randomKey),
  );
  if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Rastgele başlık bulunamadı.");
  return { ...topic, url: topicPublicUrl(topic) };
}

export interface HomeSamplerEntry {
  id: string;
  publicId: number;
  body: string;
  score: number;
  createdAt: Date;
  edited: boolean;
  bookmarkCount: number;
  topic: { id: string; publicId: number; title: string; slug: string };
  author: { id: string; username: string; displayName: string };
}

export interface HomeSamplerBlock {
  topic: { id: string; publicId: number; title: string; slug: string; entryCount: number };
  entry: HomeSamplerEntry;
}

/**
 * Ana sayfa örneklemi: gündem sıralamasına göre ilk başlıklar ve her birinden tek
 * bir temsilci entry (en yüksek puan, eşitlikte en yeni).
 *
 * Sorgu bütçesi **iki** ham sorgudur: biri başlıkları puanlar, diğeri `DISTINCT ON`
 * ile başlık başına tek entry döndürür. Blok başına sorgu açılmaz.
 */
export async function getHomeSampler(
  client: DatabaseClient,
  input: { limit?: number; now?: Date } = {},
): Promise<HomeSamplerBlock[]> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? HOME_SAMPLER_BLOCK_COUNT;
  if (limit <= 0) return [];
  const windowStart = topicFeedWindowStart("trending", now);
  return client.$transaction(async (transaction) => {
    const { topics } = await listScoredTopics(transaction, {
      windowStart,
      now,
      skip: 0,
      take: homeSamplerTopicCandidateCount(limit),
    });
    const candidates = topics.filter((topic) => topic.entryCount > 0).slice(0, limit);
    const rows = await listTopEntryPerTopic(transaction, {
      topicIds: candidates.map((topic) => topic.id),
    });
    const entryByTopic = new Map(rows.map((row) => [row.topicId, row]));
    return candidates.flatMap((topic) => {
      const row = entryByTopic.get(topic.id);
      if (!row) return [];
      const publicTopic = {
        id: topic.id,
        publicId: topic.publicId,
        title: topic.title,
        slug: topic.slug,
      };
      return [
        {
          topic: { ...publicTopic, entryCount: topic.entryCount },
          entry: {
            id: row.id,
            publicId: row.publicId,
            body: row.body,
            score: row.score,
            createdAt: row.createdAt,
            edited: row.revisionCount > 0,
            bookmarkCount: row.bookmarkCount,
            topic: publicTopic,
            author: {
              id: row.authorId,
              username: row.authorUsername,
              displayName: row.authorDisplayName,
            },
          },
        },
      ];
    });
  });
}
