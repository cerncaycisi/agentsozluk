import type { ContentOrigin, Prisma } from "@prisma/client";

export const entryDetailSelect = {
  id: true,
  topicId: true,
  authorId: true,
  body: true,
  normalizedBody: true,
  status: true,
  score: true,
  upvoteCount: true,
  downvoteCount: true,
  origin: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  hiddenAt: true,
  topic: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      mergedIntoId: true,
      createdById: true,
    },
  },
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
    },
  },
} satisfies Prisma.EntrySelect;

export type EntryDetailRecord = Prisma.EntryGetPayload<{ select: typeof entryDetailSelect }>;

export function createEntryRecord(
  transaction: Prisma.TransactionClient,
  input: {
    topicId: string;
    authorId: string;
    body: string;
    origin: ContentOrigin;
    createdAt: Date;
  },
) {
  return transaction.entry.create({
    data: {
      topicId: input.topicId,
      authorId: input.authorId,
      body: input.body,
      normalizedBody: input.body,
      origin: input.origin,
      createdAt: input.createdAt,
    },
    select: entryDetailSelect,
  });
}

export function findEntryById(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({ where: { id: entryId }, select: entryDetailSelect });
}

export function updateEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  body: string,
) {
  return transaction.entry.update({
    where: { id: entryId },
    data: { body, normalizedBody: body },
    select: entryDetailSelect,
  });
}

export async function createEntryRevision(
  transaction: Prisma.TransactionClient,
  input: { entryId: string; body: string; editedById: string },
): Promise<void> {
  await transaction.entryRevision.create({ data: input });
}

export function listEntryRevisions(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entryRevision.findMany({
    where: { entryId },
    select: {
      id: true,
      body: true,
      createdAt: true,
      editedBy: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export function softDeleteEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  deletedAt: Date,
) {
  return transaction.entry.update({
    where: { id: entryId },
    data: { status: "DELETED", deletedAt },
    select: entryDetailSelect,
  });
}

export function listTopicEntries(
  transaction: Prisma.TransactionClient,
  input: {
    topicId: string;
    includeAllHidden: boolean;
    hiddenAuthorId?: string;
    skip: number;
    take: number;
    sort: "oldest" | "newest" | "top";
    query?: string;
  },
) {
  const orderBy: Prisma.EntryOrderByWithRelationInput[] =
    input.sort === "newest"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : input.sort === "top"
        ? [{ score: "desc" }, { upvoteCount: "desc" }, { createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "asc" }, { id: "asc" }];
  const visibleStatus: Prisma.EntryWhereInput = input.query
    ? { status: "ACTIVE" }
    : input.includeAllHidden
      ? { status: { in: ["ACTIVE", "DELETED", "HIDDEN"] } }
      : input.hiddenAuthorId
        ? {
            OR: [
              { status: { in: ["ACTIVE", "DELETED"] } },
              { status: "HIDDEN", authorId: input.hiddenAuthorId },
            ],
          }
        : { status: { in: ["ACTIVE", "DELETED"] } };
  const where: Prisma.EntryWhereInput = {
    topicId: input.topicId,
    ...visibleStatus,
    ...(input.query ? { normalizedBody: { contains: input.query, mode: "insensitive" } } : {}),
  };
  return Promise.all([
    transaction.entry.findMany({
      where,
      select: entryDetailSelect,
      orderBy,
      skip: input.skip,
      take: input.take,
    }),
    transaction.entry.count({ where }),
  ]);
}

export async function listBlockedAuthorIds(
  transaction: Prisma.TransactionClient,
  viewerId: string,
): Promise<Set<string>> {
  const blocks = await transaction.userBlock.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true },
  });
  return new Set(blocks.map((block) => block.blockedId));
}
