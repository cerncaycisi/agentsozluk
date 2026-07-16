import type { Prisma } from "@prisma/client";

export async function lockEntryVoteCounter(
  transaction: Prisma.TransactionClient,
  entryId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`entry-vote:${entryId}`}, 0))
  `;
}

export function findVote(transaction: Prisma.TransactionClient, entryId: string, userId: string) {
  return transaction.entryVote.findUnique({ where: { entryId_userId: { entryId, userId } } });
}

export function upsertVote(
  transaction: Prisma.TransactionClient,
  entryId: string,
  userId: string,
  value: -1 | 1,
) {
  return transaction.entryVote.upsert({
    where: { entryId_userId: { entryId, userId } },
    create: { entryId, userId, value },
    update: { value },
  });
}

export function removeVoteRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  userId: string,
) {
  return transaction.entryVote.deleteMany({ where: { entryId, userId } });
}

export function updateEntryVoteCounters(
  transaction: Prisma.TransactionClient,
  entryId: string,
  counters: { upvoteCount: number; downvoteCount: number; score: number },
) {
  return transaction.entry.update({
    where: { id: entryId },
    data: counters,
    select: { id: true, score: true, upvoteCount: true, downvoteCount: true },
  });
}

export function putBookmarkRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  userId: string,
) {
  return transaction.entryBookmark.upsert({
    where: { entryId_userId: { entryId, userId } },
    create: { entryId, userId },
    update: {},
  });
}

export function removeBookmarkRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  userId: string,
) {
  return transaction.entryBookmark.deleteMany({ where: { entryId, userId } });
}

export function putFollowRecord(
  transaction: Prisma.TransactionClient,
  topicId: string,
  userId: string,
) {
  return transaction.topicFollow.upsert({
    where: { topicId_userId: { topicId, userId } },
    create: { topicId, userId },
    update: {},
  });
}

export function removeFollowRecord(
  transaction: Prisma.TransactionClient,
  topicId: string,
  userId: string,
) {
  return transaction.topicFollow.deleteMany({ where: { topicId, userId } });
}

export function putBlockRecord(
  transaction: Prisma.TransactionClient,
  blockerId: string,
  blockedId: string,
) {
  return transaction.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
}

export function removeBlockRecord(
  transaction: Prisma.TransactionClient,
  blockerId: string,
  blockedId: string,
) {
  return transaction.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export function findBlockTarget(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, status: true },
  });
}

export function listBookmarks(
  transaction: Prisma.TransactionClient,
  userId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryBookmarkWhereInput = {
    userId,
    entry: { status: "ACTIVE", topic: { status: "ACTIVE" } },
  };
  return Promise.all([
    transaction.entryBookmark.findMany({
      where,
      select: {
        createdAt: true,
        entry: {
          select: {
            id: true,
            body: true,
            score: true,
            createdAt: true,
            topic: { select: { id: true, title: true, slug: true } },
            author: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { entryId: "desc" }],
      skip,
      take,
    }),
    transaction.entryBookmark.count({ where }),
  ]);
}

export function listFollows(
  transaction: Prisma.TransactionClient,
  userId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.TopicFollowWhereInput = { userId, topic: { status: "ACTIVE" } };
  return Promise.all([
    transaction.topicFollow.findMany({
      where,
      select: {
        createdAt: true,
        topic: {
          select: {
            id: true,
            title: true,
            slug: true,
            entryCount: true,
            lastEntryAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { topicId: "desc" }],
      skip,
      take,
    }),
    transaction.topicFollow.count({ where }),
  ]);
}

export function listVotes(
  transaction: Prisma.TransactionClient,
  userId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryVoteWhereInput = {
    userId,
    entry: { status: "ACTIVE", topic: { status: "ACTIVE" } },
  };
  return Promise.all([
    transaction.entryVote.findMany({
      where,
      select: {
        value: true,
        updatedAt: true,
        entry: {
          select: {
            id: true,
            body: true,
            score: true,
            createdAt: true,
            topic: { select: { id: true, title: true, slug: true } },
            author: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { entryId: "desc" }],
      skip,
      take,
    }),
    transaction.entryVote.count({ where }),
  ]);
}

export function listBlocks(
  transaction: Prisma.TransactionClient,
  userId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.UserBlockWhereInput = { blockerId: userId };
  return Promise.all([
    transaction.userBlock.findMany({
      where,
      select: {
        createdAt: true,
        blocked: { select: { id: true, username: true, displayName: true, status: true } },
      },
      orderBy: [{ createdAt: "desc" }, { blockedId: "desc" }],
      skip,
      take,
    }),
    transaction.userBlock.count({ where }),
  ]);
}
