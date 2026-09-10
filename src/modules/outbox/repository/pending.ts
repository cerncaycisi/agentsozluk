import type { Prisma } from "@prisma/client";

/** Gelecekteki consumer için tek aday sorgusu; arşiv teslim edilmiş sayılmaz. */
export function findPendingOutboxEvents(transaction: Prisma.TransactionClient, take: number) {
  if (!Number.isInteger(take) || take < 1 || take > 1000) throw new Error("OUTBOX_INVALID_LIMIT");
  return transaction.outboxEvent.findMany({
    where: { processedAt: null, resetArchive: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
  });
}
