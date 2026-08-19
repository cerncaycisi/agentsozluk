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

/** Ana sayfadaki "başlık + o başlıktan tek entry" bloklarının sayısı. */
export const HOME_SAMPLER_BLOCK_COUNT = 10;

/**
 * Gündem sıralamasındaki bazı başlıklarda görüntülenebilir entry olmayabilir
 * (hepsi silinmiş ya da seed görünürlüğünden düşürülmüş olabilir). Bu yüzden
 * istenen blok sayısının katı kadar aday başlık çekilir; entry'si olmayanlar
 * elendikten sonra ilk `limit` tanesi gösterilir. Aday sayısı gündem akışının
 * kendi üst sınırını aşmaz.
 */
export function homeSamplerTopicCandidateCount(limit: number): number {
  return Math.min(TOPIC_FEED_MAX_ITEMS, Math.max(limit, limit * 3));
}
