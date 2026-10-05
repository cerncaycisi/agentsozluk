import type { TransactionClient } from "@/lib/db/types";
import { publicIdBigInt } from "@/lib/db/public-ids";
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
