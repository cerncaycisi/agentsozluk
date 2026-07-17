export const TOPIC_FEEDS = ["trending", "recent", "new", "popular"] as const;
export type TopicFeed = (typeof TOPIC_FEEDS)[number];

export const TOPIC_FEED_MAX_ITEMS = 30;

export function boundedFeedWindow(skip: number, pageSize: number): { skip: number; take: number } {
  const boundedSkip = Math.min(skip, TOPIC_FEED_MAX_ITEMS);
  const boundedPageSize = Math.min(pageSize, TOPIC_FEED_MAX_ITEMS);
  return {
    skip: boundedSkip,
    take: Math.min(boundedPageSize, Math.max(0, TOPIC_FEED_MAX_ITEMS - boundedSkip)),
  };
}

export function topicFeedWindowStart(feed: TopicFeed, now: Date): Date {
  return feed === "trending" ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
}
