import type { ContentOrigin, Prisma } from "@prisma/client";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";

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
  _count: { select: { revisions: true } },
} satisfies Prisma.EntrySelect;

export type EntryDetailRecord = Prisma.EntryGetPayload<{ select: typeof entryDetailSelect }>;

export async function lockEntryState(
  transaction: Prisma.TransactionClient,
  entryId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`entry-state:${entryId}`}, 0))
  `;
}

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
      normalizedBody: normalizeEntrySearchText(input.body),
      origin: input.origin,
      createdAt: input.createdAt,
    },
    select: entryDetailSelect,
  });
}

export function findEntryById(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({ where: { id: entryId }, select: entryDetailSelect });
}

export async function updateEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  body: string,
) {
  const result = await transaction.entry.updateMany({
    where: { id: entryId, status: "ACTIVE", deletedAt: null, origin: { not: "SEED" } },
    data: { body, normalizedBody: normalizeEntrySearchText(body) },
  });
  return result.count === 1 ? findEntryById(transaction, entryId) : null;
}

export async function createEntryRevision(
  transaction: Prisma.TransactionClient,
  input: { entryId: string; body: string; editedById: string },
): Promise<void> {
  await transaction.entryRevision.create({ data: input });
}

export function listEntryRevisions(
  transaction: Prisma.TransactionClient,
  entryId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryRevisionWhereInput = { entryId };
  return Promise.all([
    transaction.entryRevision.findMany({
      where,
      select: {
        id: true,
        body: true,
        createdAt: true,
        editedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    transaction.entryRevision.count({ where }),
  ]);
}

export async function softDeleteEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  deletedAt: Date,
) {
  const result = await transaction.entry.updateMany({
    where: { id: entryId, status: "ACTIVE", deletedAt: null, origin: { not: "SEED" } },
    data: { status: "DELETED", deletedAt },
  });
  return result.count === 1 ? findEntryById(transaction, entryId) : null;
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
    createdAtWindow?: { start: Date; end: Date };
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
    ...(input.createdAtWindow
      ? { createdAt: { gte: input.createdAtWindow.start, lte: input.createdAtWindow.end } }
      : {}),
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
  authorIds: string[],
): Promise<Set<string>> {
  const blocks = await transaction.userBlock.findMany({
    where: { blockerId: viewerId, blockedId: { in: authorIds } },
    select: { blockedId: true },
  });
  return new Set(blocks.map((block) => block.blockedId));
}
