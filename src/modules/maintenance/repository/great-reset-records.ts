import type { Prisma } from "@prisma/client";

export type RemovedContentKind = "TOPIC" | "ENTRY";
export type RemovedContentReference = { publicId: number } | { contentId: string };

/** Commit işareti tabloda en çok bir satırdır (`great_reset_commits_single_idx`). */
export async function hasGreatResetCommit(transaction: Prisma.TransactionClient): Promise<boolean> {
  const commit = await transaction.greatResetCommit.findFirst({ select: { operationId: true } });
  return commit !== null;
}

/** Durumu ne olursa olsun satır varsa canlı sayılır; görünürlük kararı sayfanın normal akışıdır. */
export async function liveContentExists(
  transaction: Prisma.TransactionClient,
  kind: RemovedContentKind,
  reference: RemovedContentReference,
): Promise<boolean> {
  const where =
    "publicId" in reference ? { publicId: reference.publicId } : { id: reference.contentId };
  const row =
    kind === "TOPIC"
      ? await transaction.topic.findUnique({ where, select: { id: true } })
      : await transaction.entry.findUnique({ where, select: { id: true } });
  return row !== null;
}

export async function tombstoneExists(
  transaction: Prisma.TransactionClient,
  kind: RemovedContentKind,
  reference: RemovedContentReference,
): Promise<boolean> {
  const row = await transaction.greatResetTombstone.findUnique({
    where:
      "publicId" in reference
        ? { kind_publicId: { kind, publicId: reference.publicId } }
        : { kind_contentId: { kind, contentId: reference.contentId } },
    select: { kind: true },
  });
  return row !== null;
}
