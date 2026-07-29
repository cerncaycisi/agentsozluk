import type { Prisma } from "@prisma/client";

export function findSeedVisibilityTarget(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      publicId: true,
      topicId: true,
      origin: true,
      status: true,
      topic: { select: { publicId: true, title: true, slug: true, status: true } },
      seedVisibility: {
        select: {
          suppressed: true,
          suppressionReason: true,
          suppressedAt: true,
          restorationReason: true,
          restoredAt: true,
        },
      },
    },
  });
}

export function setSeedVisibilityRecord(
  transaction: Prisma.TransactionClient,
  input: {
    entryId: string;
    suppressed: boolean;
    reason: string;
    actorId: string;
    now: Date;
  },
) {
  return transaction.seedEntryVisibility.upsert({
    where: { entryId: input.entryId },
    create: {
      entryId: input.entryId,
      suppressed: true,
      suppressionReason: input.reason,
      suppressedById: input.actorId,
      suppressedAt: input.now,
    },
    update: input.suppressed
      ? {
          suppressed: true,
          suppressionReason: input.reason,
          suppressedById: input.actorId,
          suppressedAt: input.now,
          restorationReason: null,
          restoredById: null,
          restoredAt: null,
        }
      : {
          suppressed: false,
          restorationReason: input.reason,
          restoredById: input.actorId,
          restoredAt: input.now,
        },
    select: {
      entryId: true,
      suppressed: true,
      suppressionReason: true,
      suppressedAt: true,
      restorationReason: true,
      restoredAt: true,
    },
  });
}

export function listCanonicalSeedEntries(
  transaction: Prisma.TransactionClient,
  input: { query?: string; skip: number; take: number },
) {
  const where: Prisma.EntryWhereInput = {
    origin: "SEED",
    ...(input.query
      ? {
          OR: [
            { normalizedBody: { contains: input.query, mode: "insensitive" } },
            { topic: { title: { contains: input.query, mode: "insensitive" } } },
            { author: { usernameNormalized: { contains: input.query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  return Promise.all([
    transaction.entry.findMany({
      where,
      skip: input.skip,
      take: input.take,
      orderBy: [{ publicId: "asc" }],
      select: {
        id: true,
        publicId: true,
        body: true,
        status: true,
        createdAt: true,
        topic: { select: { publicId: true, title: true, slug: true, status: true } },
        author: { select: { username: true, displayName: true } },
        seedVisibility: {
          select: {
            suppressed: true,
            suppressionReason: true,
            suppressedAt: true,
            restorationReason: true,
            restoredAt: true,
          },
        },
      },
    }),
    transaction.entry.count({ where }),
  ]);
}
