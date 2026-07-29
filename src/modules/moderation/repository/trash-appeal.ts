import type { EntryReviewOutcome, EntryTrashSource, Prisma } from "@prisma/client";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";

const trashCaseListSelect = {
  id: true,
  entryId: true,
  authorId: true,
  topicId: true,
  source: true,
  sourceReason: true,
  openedAt: true,
  closedAt: true,
  entry: {
    select: {
      id: true,
      publicId: true,
      body: true,
      status: true,
      updatedAt: true,
      author: { select: { id: true, username: true, displayName: true } },
    },
  },
  topic: { select: { id: true, publicId: true, title: true, slug: true } },
  revivalRequests: {
    select: {
      id: true,
      submittedBody: true,
      createdAt: true,
      decision: {
        select: {
          id: true,
          outcome: true,
          rationale: true,
          constitutionalArticles: true,
          createdAt: true,
          decider: { select: { id: true, username: true, displayName: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
  appeals: {
    select: {
      id: true,
      moderationReason: true,
      correction: true,
      defense: true,
      createdAt: true,
      decision: {
        select: {
          id: true,
          outcome: true,
          rationale: true,
          constitutionalArticles: true,
          createdAt: true,
          decider: { select: { id: true, username: true, displayName: true } },
        },
      },
    },
  },
} satisfies Prisma.EntryTrashCaseSelect;

export function createEntryTrashCase(
  transaction: Prisma.TransactionClient,
  input: {
    entryId: string;
    authorId: string;
    topicId: string;
    source: EntryTrashSource;
    sourceActionId?: string;
    sourceReason: string;
    openedAt: Date;
  },
) {
  return transaction.entryTrashCase.create({
    data: {
      entryId: input.entryId,
      authorId: input.authorId,
      topicId: input.topicId,
      source: input.source,
      ...(input.sourceActionId ? { sourceActionId: input.sourceActionId } : {}),
      sourceReason: input.sourceReason,
      openedAt: input.openedAt,
    },
  });
}

export function findEntryOwnerForReview(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({
    where: { id: entryId },
    select: { authorId: true },
  });
}

export function findRevivalRequester(transaction: Prisma.TransactionClient, requestId: string) {
  return transaction.entryRevivalRequest.findUnique({
    where: { id: requestId },
    select: { requestedById: true },
  });
}

export function findAppealAppellant(transaction: Prisma.TransactionClient, appealId: string) {
  return transaction.entryAppeal.findUnique({
    where: { id: appealId },
    select: { appellantId: true },
  });
}

export function findOpenEntryTrashCase(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entryTrashCase.findFirst({
    where: { entryId, closedAt: null },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    include: {
      entry: {
        select: {
          id: true,
          publicId: true,
          authorId: true,
          topicId: true,
          body: true,
          normalizedBody: true,
          status: true,
          origin: true,
        },
      },
      topic: { select: { id: true, publicId: true, title: true, slug: true } },
      revivalRequests: {
        include: { decision: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      appeals: { include: { decision: true } },
    },
  });
}

export function closeEntryTrashCase(
  transaction: Prisma.TransactionClient,
  trashCaseId: string,
  closedAt: Date,
) {
  return transaction.entryTrashCase.updateMany({
    where: { id: trashCaseId, closedAt: null },
    data: { closedAt },
  });
}

export function listEntryTrashCasesForAuthor(
  transaction: Prisma.TransactionClient,
  authorId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryTrashCaseWhereInput = { authorId };
  return Promise.all([
    transaction.entryTrashCase.findMany({
      where,
      select: trashCaseListSelect,
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    transaction.entryTrashCase.count({ where }),
  ]);
}

export function updateTrashEntryBody(
  transaction: Prisma.TransactionClient,
  entryId: string,
  body: string,
) {
  return transaction.entry.updateMany({
    where: { id: entryId, status: { in: ["DELETED", "HIDDEN"] }, origin: { not: "SEED" } },
    data: { body, normalizedBody: normalizeEntrySearchText(body) },
  });
}

export function createEntryRevivalRequest(
  transaction: Prisma.TransactionClient,
  input: {
    trashCaseId: string;
    entryId: string;
    requestedById: string;
    previousRevisionId: string;
    submittedBody: string;
  },
) {
  return transaction.entryRevivalRequest.create({
    data: input,
    include: {
      trashCase: { select: { sourceReason: true } },
      entry: { select: { publicId: true } },
    },
  });
}

export function findEntryRevivalRequestForDecision(
  transaction: Prisma.TransactionClient,
  requestId: string,
) {
  return transaction.entryRevivalRequest.findUnique({
    where: { id: requestId },
    include: {
      decision: true,
      requestedBy: { select: { id: true, username: true, displayName: true } },
      trashCase: true,
      entry: {
        select: {
          id: true,
          publicId: true,
          authorId: true,
          topicId: true,
          body: true,
          status: true,
        },
      },
    },
  });
}

export function createEntryRevivalDecision(
  transaction: Prisma.TransactionClient,
  input: {
    requestId: string;
    deciderId: string;
    outcome: EntryReviewOutcome;
    constitutionalArticles: number[];
    rationale: string;
  },
) {
  return transaction.entryRevivalDecision.create({ data: input });
}

export function listOpenEntryRevivalRequests(
  transaction: Prisma.TransactionClient,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryRevivalRequestWhereInput = {
    decision: null,
    trashCase: { closedAt: null },
  };
  return Promise.all([
    transaction.entryRevivalRequest.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, username: true, displayName: true } },
        trashCase: { select: { source: true, sourceReason: true, openedAt: true } },
        entry: { select: { id: true, publicId: true, body: true, status: true } },
        previousRevision: { select: { id: true, body: true, createdAt: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    transaction.entryRevivalRequest.count({ where }),
  ]);
}

export function createEntryAppeal(
  transaction: Prisma.TransactionClient,
  input: {
    trashCaseId: string;
    entryId: string;
    topicId: string;
    appellantId: string;
    revivalRequestId: string;
    moderationReason: string;
    topicTitleSnapshot: string;
    bodySnapshot: string;
    correction: string;
    defense: string;
  },
) {
  return transaction.entryAppeal.create({
    data: input,
    include: {
      entry: { select: { publicId: true } },
      topic: { select: { publicId: true, title: true, slug: true } },
    },
  });
}

export function findEntryAppealForDecision(
  transaction: Prisma.TransactionClient,
  appealId: string,
) {
  return transaction.entryAppeal.findUnique({
    where: { id: appealId },
    include: {
      decision: true,
      appellant: { select: { id: true, username: true, displayName: true } },
      trashCase: true,
      entry: {
        select: {
          id: true,
          publicId: true,
          authorId: true,
          topicId: true,
          body: true,
          status: true,
        },
      },
    },
  });
}

export function createEntryAppealDecision(
  transaction: Prisma.TransactionClient,
  input: {
    appealId: string;
    deciderId: string;
    outcome: EntryReviewOutcome;
    constitutionalArticles: number[];
    rationale: string;
  },
) {
  return transaction.entryAppealDecision.create({ data: input });
}

export function listOpenEntryAppeals(
  transaction: Prisma.TransactionClient,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryAppealWhereInput = {
    decision: null,
    trashCase: { closedAt: null },
  };
  return Promise.all([
    transaction.entryAppeal.findMany({
      where,
      include: {
        appellant: { select: { id: true, username: true, displayName: true } },
        entry: { select: { id: true, publicId: true, status: true } },
        topic: { select: { id: true, publicId: true, title: true, slug: true } },
        revivalRequest: {
          select: {
            id: true,
            submittedBody: true,
            createdAt: true,
            decision: { select: { outcome: true, rationale: true, createdAt: true } },
          },
        },
        trashCase: { select: { source: true, sourceReason: true, openedAt: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    transaction.entryAppeal.count({ where }),
  ]);
}

export function restoreEntryFromTrash(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.updateMany({
    where: { id: entryId, status: { in: ["DELETED", "HIDDEN"] }, origin: { not: "SEED" } },
    data: { status: "ACTIVE", deletedAt: null, hiddenAt: null },
  });
}
