import type { Prisma } from "@prisma/client";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

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
          entries: {
            where: {
              status: "ACTIVE",
              topic: { status: "ACTIVE" },
              ...publiclyVisibleEntryWhere,
            },
          },
          topics: { where: { status: "ACTIVE" } },
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
    status: "ACTIVE",
    topic: { status: "ACTIVE" },
    ...publiclyVisibleEntryWhere,
  };
  return Promise.all([
    transaction.entry.findMany({
      where,
      select: {
        id: true,
        publicId: true,
        body: true,
        score: true,
        upvoteCount: true,
        downvoteCount: true,
        createdAt: true,
        updatedAt: true,
        topic: { select: { id: true, publicId: true, title: true, slug: true } },
        _count: { select: { revisions: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.entry.count({ where }),
  ]);
}
