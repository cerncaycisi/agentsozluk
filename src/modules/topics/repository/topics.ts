import type { ContentOrigin, Prisma } from "@prisma/client";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";

export const topicSummarySelect = {
  id: true,
  publicId: true,
  title: true,
  normalizedTitle: true,
  slug: true,
  status: true,
  mergedIntoId: true,
  entryCount: true,
  lastEntryAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TopicSelect;

export type TopicSummaryRecord = Prisma.TopicGetPayload<{ select: typeof topicSummarySelect }>;

export async function lockTopicState(
  transaction: Prisma.TransactionClient,
  topicIds: string | string[],
): Promise<void> {
  const orderedTopicIds = [...new Set(Array.isArray(topicIds) ? topicIds : [topicIds])].sort();
  for (const topicId of orderedTopicIds) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`topic-state:${topicId}`}, 0))
    `;
  }
}

export async function lockTopicTitle(
  transaction: Prisma.TransactionClient,
  normalizedTitle: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${normalizedTitle}, 0))
  `;
}

export function findTopicConflict(transaction: Prisma.TransactionClient, normalizedTitle: string) {
  return transaction.topic.findFirst({
    where: {
      OR: [{ normalizedTitle }, { aliases: { some: { normalizedTitle } } }],
    },
    select: topicSummarySelect,
  });
}

export function createTopicWithFirstEntryRecord(
  transaction: Prisma.TransactionClient,
  input: {
    title: string;
    normalizedTitle: string;
    slug: string;
    createdById: string;
    entryBody: string;
    origin: ContentOrigin;
    now: Date;
  },
) {
  return transaction.topic.create({
    data: {
      title: input.title,
      normalizedTitle: input.normalizedTitle,
      slug: input.slug,
      createdById: input.createdById,
      entryCount: 1,
      lastEntryAt: input.now,
      entries: {
        create: {
          authorId: input.createdById,
          body: input.entryBody,
          normalizedBody: normalizeEntrySearchText(input.entryBody),
          origin: input.origin,
          createdAt: input.now,
        },
      },
    },
    select: {
      ...topicSummarySelect,
      entries: {
        select: { id: true, publicId: true, body: true, status: true, createdAt: true },
        take: 1,
      },
    },
  });
}

export function findTopicById(transaction: Prisma.TransactionClient, topicId: string) {
  return transaction.topic.findUnique({
    where: { id: topicId },
    select: {
      ...topicSummarySelect,
      createdById: true,
      mergedInto: { select: topicSummarySelect },
    },
  });
}

export function findTopicByPublicId(transaction: Prisma.TransactionClient, publicId: number) {
  return transaction.topic.findUnique({
    where: { publicId },
    select: {
      ...topicSummarySelect,
      createdById: true,
      mergedInto: { select: topicSummarySelect },
    },
  });
}

export function isFollowingTopic(
  transaction: Prisma.TransactionClient,
  topicId: string,
  userId: string,
) {
  return transaction.topicFollow.findUnique({ where: { topicId_userId: { topicId, userId } } });
}

export async function updateTopicAfterEntryCreate(
  transaction: Prisma.TransactionClient,
  topicId: string,
  createdAt: Date,
): Promise<void> {
  await transaction.topic.update({
    where: { id: topicId },
    data: { entryCount: { increment: 1 }, lastEntryAt: createdAt },
  });
}

export async function recalculateTopicCounter(
  transaction: Prisma.TransactionClient,
  topicId: string,
): Promise<void> {
  await transaction.$executeRaw`
    UPDATE "topics" AS topic
    SET
      "entryCount" = (
        SELECT COUNT(*)::integer
        FROM "entries" AS entry
        WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
      ),
      "lastEntryAt" = (
        SELECT MAX(entry."createdAt")
        FROM "entries" AS entry
        WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
      )
    WHERE topic."id" = ${topicId}::uuid
  `;
}

export function listActiveTopicsForSitemap(
  transaction: Prisma.TransactionClient,
  skip: number,
  take: number,
) {
  return transaction.topic.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, publicId: true, slug: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}

export function countActiveTopics(transaction: Prisma.TransactionClient) {
  return transaction.topic.count({ where: { status: "ACTIVE" } });
}
