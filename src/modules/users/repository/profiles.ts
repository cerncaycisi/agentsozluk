import type { Prisma } from "@prisma/client";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

/**
 * Profil sekmelerinin etiketindeki sayı ile sekmenin listesi aynı filtreden
 * gelmek zorunda. Sayaç (`_count`) ve liste sorgusu bu iki sabiti paylaşır;
 * biri değişirse diğeri de değişir, sayı ile liste ayrışamaz.
 */
export const publicProfileEntryWhere = {
  status: "ACTIVE",
  topic: { status: "ACTIVE" },
  ...publiclyVisibleEntryWhere,
} satisfies Prisma.EntryWhereInput;

export const publicProfileTopicWhere = {
  status: "ACTIVE",
} satisfies Prisma.TopicWhereInput;

export function findPublicProfile(
  transaction: Prisma.TransactionClient,
  usernameNormalized: string,
) {
  return transaction.user.findUnique({
    where: { usernameNormalized },
    select: {
      id: true,
      status: true,
      username: true,
      displayName: true,
      bio: true,
      createdAt: true,
      _count: {
        select: {
          entries: { where: publicProfileEntryWhere },
          topics: { where: publicProfileTopicWhere },
        },
      },
    },
  });
}

export function listPublicProfileEntries(
  transaction: Prisma.TransactionClient,
  input: { userId: string; skip: number; take: number },
) {
  const where: Prisma.EntryWhereInput = {
    authorId: input.userId,
    ...publicProfileEntryWhere,
  };
  return Promise.all([
    transaction.entry.findMany({
      where,
      select: {
        id: true,
        publicId: true,
        body: true,
        score: true,
        status: true,
        origin: true,
        upvoteCount: true,
        downvoteCount: true,
        createdAt: true,
        updatedAt: true,
        topic: { select: { id: true, publicId: true, title: true, slug: true } },
        _count: { select: { revisions: true, bookmarks: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.entry.count({ where }),
  ]);
}

export function listPublicProfileTopics(
  transaction: Prisma.TransactionClient,
  input: { userId: string; skip: number; take: number },
) {
  const where: Prisma.TopicWhereInput = {
    createdById: input.userId,
    ...publicProfileTopicWhere,
  };
  return Promise.all([
    transaction.topic.findMany({
      where,
      select: {
        id: true,
        publicId: true,
        title: true,
        slug: true,
        entryCount: true,
        lastEntryAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.topic.count({ where }),
  ]);
}
