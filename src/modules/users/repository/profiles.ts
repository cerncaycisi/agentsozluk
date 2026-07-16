import type { Prisma } from "@prisma/client";

export function findPublicProfile(
  transaction: Prisma.TransactionClient,
  usernameNormalized: string,
) {
  return transaction.user.findUnique({
    where: { usernameNormalized },
    select: {
      id: true,
      kind: true,
      role: true,
      status: true,
      username: true,
      displayName: true,
      bio: true,
      createdAt: true,
      _count: {
        select: {
          entries: { where: { status: "ACTIVE", topic: { status: "ACTIVE" } } },
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
  };
  return Promise.all([
    transaction.entry.findMany({
      where,
      select: {
        id: true,
        body: true,
        score: true,
        upvoteCount: true,
        downvoteCount: true,
        createdAt: true,
        updatedAt: true,
        topic: { select: { id: true, title: true, slug: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.entry.count({ where }),
  ]);
}
