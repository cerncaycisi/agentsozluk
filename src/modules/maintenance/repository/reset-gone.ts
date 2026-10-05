import type { TransactionClient } from "@/lib/db/types";
import { publicIdBigInt, publicIdNumber } from "@/lib/db/public-ids";
import { MAX_RESET_TOMBSTONES, type ResetGoneCandidate } from "../domain/reset-gone";

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
  const index: ResetGoneIndex = {
    operationId: commit.operationId,
    topics: { uuids: new Set(), publicIds: new Set() },
    entries: { uuids: new Set(), publicIds: new Set() },
  };
  let cursor: { kind: string; uuid: string } | undefined;
  let total = 0;
  for (;;) {
    const rows = await tx.greatResetTombstone.findMany({
      where: { operationId: commit.operationId },
      select: { kind: true, uuid: true, publicId: true },
      orderBy: [{ kind: "asc" }, { uuid: "asc" }],
      take: 1000,
      ...(cursor ? { cursor: { kind_uuid: cursor }, skip: 1 } : {}),
    });
    total += rows.length;
    if (total > MAX_RESET_TOMBSTONES) throw new Error("GREAT_RESET_TOMBSTONE_LIMIT");
    for (const row of rows) {
      const target =
        row.kind === "TOPIC" ? index.topics : row.kind === "ENTRY" ? index.entries : null;
      if (!target) throw new Error("GREAT_RESET_TOMBSTONE_KIND_INVALID");
      target.uuids.add(row.uuid);
      target.publicIds.add(publicIdNumber(row.publicId));
    }
    const last = rows.at(-1);
    if (rows.length < 1000 || !last) break;
    cursor = { kind: last.kind, uuid: last.uuid };
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
