import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { currentIstanbulDayWindow, previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import {
  findRandomActiveTopic,
  listChronologicalTopics,
  listDebeEntries,
  listScoredTopics,
} from "@/modules/feeds/repository/feeds";

export type TopicFeed = "trending" | "recent" | "new" | "popular";

export interface TopicFeedItem {
  id: string;
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
  client: PrismaClient,
  input: { feed: TopicFeed; page: number; pageSize: number; skip: number; now?: Date },
): Promise<{ topics: TopicFeedItem[]; totalItems: number }> {
  const now = input.now ?? new Date();
  const pageSize = Math.min(input.pageSize, 30);
  const skip = Math.min(input.skip, 30);
  const remaining = Math.max(0, 30 - skip);
  const take = Math.min(pageSize, remaining);
  if (take === 0) return { topics: [], totalItems: 30 };

  if (input.feed === "recent" || input.feed === "new") {
    const mode = input.feed;
    const [topics, total] = await client.$transaction((transaction) =>
      listChronologicalTopics(transaction, { mode, skip, take }),
    );
    return { topics, totalItems: Math.min(total, 30) };
  }

  const windowStart =
    input.feed === "popular"
      ? currentIstanbulDayWindow(now).start
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const topics = await client.$transaction((transaction) =>
    listScoredTopics(transaction, { windowStart, now, skip, take }),
  );
  return { topics, totalItems: Math.min(topics[0]?.totalItems ?? 0, 30) };
}

export function getDebe(client: PrismaClient, now = new Date()) {
  const window = previousIstanbulDayWindow(now);
  return client.$transaction((transaction) => listDebeEntries(transaction, window));
}

export async function getRandomTopic(client: PrismaClient, randomKey = Math.random()) {
  const topic = await client.$transaction((transaction) =>
    findRandomActiveTopic(transaction, randomKey),
  );
  if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Rastgele başlık bulunamadı.");
  return { ...topic, url: `/baslik/${topic.id}-${topic.slug}` };
}
