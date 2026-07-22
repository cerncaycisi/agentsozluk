import type { DatabaseClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { currentIstanbulDayWindow, previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import {
  boundedFeedWindow,
  TOPIC_FEED_MAX_ITEMS,
  topicFeedWindowStart,
  type TopicFeed,
} from "@/modules/feeds/domain/feed";
import {
  findRandomActiveTopic,
  listChronologicalTopics,
  listDebeEntries,
  listScoredTopics,
  listWindowedChronologicalTopics,
} from "@/modules/feeds/repository/feeds";
import { withEditedIndicator } from "@/modules/entries/domain/entry";
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
  return entries.map(withEditedIndicator);
}

export async function getRandomTopic(client: DatabaseClient, randomKey = Math.random()) {
  const topic = await client.$transaction((transaction) =>
    findRandomActiveTopic(transaction, randomKey),
  );
  if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Rastgele başlık bulunamadı.");
  return { ...topic, url: topicPublicUrl(topic) };
}
