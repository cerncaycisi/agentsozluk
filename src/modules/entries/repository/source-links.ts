import type { Prisma } from "@prisma/client";

/** Yapay yazar entry'lerinin eylem kaynak bilgisini ve kaynak öğelerini okur (G3). */
export function findEntryProvenanceRecords(
  transaction: Prisma.TransactionClient,
  entryIds: readonly string[],
) {
  return transaction.agentContentRecord.findMany({
    where: { entryId: { in: [...entryIds] } },
    select: { entryId: true, action: { select: { provenance: true } } },
  });
}

export function findSourceItemLinks(
  transaction: Prisma.TransactionClient,
  itemIds: readonly string[],
) {
  return transaction.agentSourceItem.findMany({
    where: { id: { in: [...itemIds] } },
    select: { id: true, canonicalUrl: true, source: { select: { normalizedDomain: true } } },
  });
}
