import type { TransactionClient } from "@/lib/db/types";
import { publicIdBigInt, publicIdNumber } from "@/lib/db/public-ids";
import type { ResetGoneCandidate } from "../domain/reset-gone";

/** Yalnız varlık okunur; eski title/body/metadata middleware yanıtına taşınmaz. */
export async function findResetGoneDecision(
  tx: TransactionClient,
  candidate: ResetGoneCandidate,
): Promise<"PASS" | "GONE"> {
  await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
  const commit = await tx.greatResetCommit.findFirst({ select: { operationId: true } });
  if (!commit) return "PASS";
  const where =
    candidate.reference === "UUID"
      ? { id: candidate.uuid }
      : { publicId: publicIdBigInt(candidate.publicId) };
  const live =
    candidate.kind === "TOPIC"
      ? await tx.topic.findUnique({ where, select: { id: true } })
      : await tx.entry.findUnique({ where, select: { id: true } });
  if (live) return "PASS";
  const tombstoneWhere =
    candidate.reference === "UUID"
      ? { kind_uuid: { kind: candidate.kind, uuid: candidate.uuid } }
      : { kind_publicId: { kind: candidate.kind, publicId: publicIdBigInt(candidate.publicId) } };
  const tombstone = await tx.greatResetTombstone.findUnique({
    where: tombstoneWhere,
    select: { operationId: true },
  });
  return tombstone?.operationId === commit.operationId ? "GONE" : "PASS";
}

export type ResetGoneIndex = {
  operationId: string;
  topics: { uuids: Set<string>; publicIds: Set<number> };
  entries: { uuids: Set<string>; publicIds: Set<number> };
};

/** Yalnız başarılı okumadan sonra süreç önbelleğine alınabilir; reset/restore app restart ister. */
export async function loadResetGoneIndex(tx: TransactionClient): Promise<ResetGoneIndex | null> {
  await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
  const commit = await tx.greatResetCommit.findFirst({ select: { operationId: true } });
  if (!commit) return null;
  const rows = await tx.greatResetTombstone.findMany({
    where: { operationId: commit.operationId },
    select: { kind: true, uuid: true, publicId: true },
  });
  const index: ResetGoneIndex = {
    operationId: commit.operationId,
    topics: { uuids: new Set(), publicIds: new Set() },
    entries: { uuids: new Set(), publicIds: new Set() },
  };
  for (const row of rows) {
    const target =
      row.kind === "TOPIC" ? index.topics : row.kind === "ENTRY" ? index.entries : null;
    if (!target) throw new Error("GREAT_RESET_TOMBSTONE_KIND_INVALID");
    target.uuids.add(row.uuid);
    target.publicIds.add(publicIdNumber(row.publicId));
  }
  return index;
}

export async function resetGoneLiveExists(
  tx: TransactionClient,
  candidate: ResetGoneCandidate,
): Promise<boolean> {
  await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
  const where =
    candidate.reference === "UUID"
      ? { id: candidate.uuid }
      : { publicId: publicIdBigInt(candidate.publicId) };
  const row =
    candidate.kind === "TOPIC"
      ? await tx.topic.findUnique({ where, select: { id: true } })
      : await tx.entry.findUnique({ where, select: { id: true } });
  return row !== null;
}
