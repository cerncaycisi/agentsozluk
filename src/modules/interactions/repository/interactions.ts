import type { Prisma } from "@prisma/client";

export async function lockEntryVoteCounter(
  transaction: Prisma.TransactionClient,
  entryId: string,
): Promise<void> {
  await lockEntryVoteCounters(transaction, [entryId]);
}

export async function lockEntryVoteCounters(
  transaction: Prisma.TransactionClient,
  entryIds: readonly string[],
): Promise<void> {
  const orderedEntryIds = [...new Set(entryIds)].sort((left, right) => left.localeCompare(right));
  for (const entryId of orderedEntryIds) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`entry-vote:${entryId}`}, 0))
    `;
  }
}

export async function findUserVoteEntryIds(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<string[]> {
  const votes = await transaction.entryVote.findMany({
    where: { userId },
    select: { entryId: true },
    orderBy: { entryId: "asc" },
  });
  return votes.map((vote) => vote.entryId);
}

export function removeUserVoteRecords(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.entryVote.deleteMany({ where: { userId } });
}

export async function recalculateEntryVoteCounters(
  transaction: Prisma.TransactionClient,
  entryIds: readonly string[],
): Promise<void> {
  const orderedEntryIds = [...new Set(entryIds)].sort((left, right) => left.localeCompare(right));
  if (orderedEntryIds.length === 0) return;

  const groupedVotes = await transaction.entryVote.groupBy({
    by: ["entryId", "value"],
    where: { entryId: { in: orderedEntryIds } },
    _count: { _all: true },
  });
  const counters = new Map(
    orderedEntryIds.map((entryId) => [entryId, { upvoteCount: 0, downvoteCount: 0, score: 0 }]),
  );
  for (const group of groupedVotes) {
    const entryCounters = counters.get(group.entryId);
    if (!entryCounters) continue;
    const count = group._count._all;
    if (group.value === 1) entryCounters.upvoteCount = count;
    if (group.value === -1) entryCounters.downvoteCount = count;
    entryCounters.score += group.value * count;
  }

  for (const [entryId, entryCounters] of counters) {
    await updateEntryVoteCounters(transaction, entryId, entryCounters);
  }
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

export function findUserFollowTarget(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, status: true },
  });
}

export function findUserFollowTargetByUsername(
  transaction: Prisma.TransactionClient,
  usernameNormalized: string,
) {
  return transaction.user.findUnique({
    where: { usernameNormalized },
    select: { id: true, username: true, displayName: true, status: true },
  });
}

export function findUserFollow(
  transaction: Prisma.TransactionClient,
  followerId: string,
  followedId: string,
) {
  return transaction.userFollow.findUnique({
    where: { followerId_followedId: { followerId, followedId } },
    select: { createdAt: true },
  });
}

export function putUserFollowRecord(
  transaction: Prisma.TransactionClient,
  followerId: string,
  followedId: string,
) {
  return transaction.userFollow.upsert({
    where: { followerId_followedId: { followerId, followedId } },
    create: { followerId, followedId },
    update: {},
  });
}

export function removeUserFollowRecord(
  transaction: Prisma.TransactionClient,
  followerId: string,
  followedId: string,
) {
  return transaction.userFollow.deleteMany({ where: { followerId, followedId } });
}

export function listUserFollows(
  transaction: Prisma.TransactionClient,
  followerId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.UserFollowWhereInput = {
    followerId,
    followed: { status: "ACTIVE" },
  };
  return Promise.all([
    transaction.userFollow.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { followedId: "desc" }],
      skip,
      take,
      select: {
        createdAt: true,
        followed: {
          select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            entries: {
              where: { status: "ACTIVE", topic: { status: "ACTIVE" } },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 3,
              select: {
                id: true,
                publicId: true,
                body: true,
                score: true,
                createdAt: true,
                topic: { select: { id: true, publicId: true, title: true, slug: true } },
                _count: { select: { revisions: true } },
              },
            },
            _count: {
              select: {
                entries: { where: { status: "ACTIVE", topic: { status: "ACTIVE" } } },
              },
            },
          },
        },
      },
    }),
    transaction.userFollow.count({ where }),
  ]);
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

export function findUserBlock(
  transaction: Prisma.TransactionClient,
  blockerId: string,
  blockedId: string,
) {
  return transaction.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { blockerId: true },
  });
}

export function listViewerEntryStates(
  transaction: Prisma.TransactionClient,
  userId: string,
  entryIds: string[],
) {
  return Promise.all([
    transaction.entryVote.findMany({
      where: { userId, entryId: { in: entryIds } },
      select: { entryId: true, value: true },
    }),
    transaction.entryBookmark.findMany({
      where: { userId, entryId: { in: entryIds } },
      select: { entryId: true },
    }),
  ]);
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
            publicId: true,
            body: true,
            score: true,
            createdAt: true,
            topic: { select: { id: true, publicId: true, title: true, slug: true } },
            author: { select: { id: true, username: true, displayName: true } },
            _count: { select: { revisions: true } },
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
            publicId: true,
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
            publicId: true,
            body: true,
            score: true,
            createdAt: true,
            topic: { select: { id: true, publicId: true, title: true, slug: true } },
            author: { select: { id: true, username: true, displayName: true } },
            _count: { select: { revisions: true } },
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
