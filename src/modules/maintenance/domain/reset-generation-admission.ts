import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const resetGenerationMirrorSchema = z
  .object({
    formatVersion: z.literal(1),
    operationId: z.string().uuid(),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/u),
    manifestSha256: hash,
    planSha256: hash,
    dumpSha256: hash,
    journalSha256: hash,
    state: z.enum(["COMMITTED_MAINTENANCE", "TRAFFIC_OPEN", "ROLLED_BACK"]),
    databaseName: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/u),
    databaseOid: z.string().regex(/^[1-9][0-9]*$/u),
    restoredDatabaseOid: z
      .string()
      .regex(/^[1-9][0-9]*$/u)
      .optional(),
    clusterId: z.string().regex(/^[0-9]{1,20}$/u),
    clearedCounts: z.record(z.string().regex(/^[a-z_]+$/u), z.number().int().nonnegative()),
  })
  .strict();
export type ResetGenerationMirror = z.infer<typeof resetGenerationMirrorSchema>;
export type ResetAdmissionEvidence = {
  databaseName: string;
  databaseOid: string;
  clusterId: string;
  commits: {
    operationId: string;
    releaseSha: string;
    manifestSha256: string;
    planSha256: string;
    clearedCounts: unknown;
  }[];
  exposures: { operationId: string; journalSha256: string }[];
  topicTombstones: number;
  entryTombstones: number;
  writersFrozen: boolean;
  clearedEmpty: boolean;
  restores: { operationId: string; dumpSha256: string; restoredDatabaseOid?: string }[];
  openIntents: number;
};
function fail(): never {
  throw new Error("GREAT_RESET_GENERATION_ADMISSION_REJECTED");
}
/** Atomic rename yeni DB'nin OID'sini korur; source OID latch içinde sabit kalır. */
export function resetMirrorDatabaseOid(mirror: ResetGenerationMirror): string {
  if (mirror.state === "ROLLED_BACK") {
    if (!mirror.restoredDatabaseOid || mirror.restoredDatabaseOid === mirror.databaseOid)
      return fail();
    return mirror.restoredDatabaseOid;
  }
  if (mirror.restoredDatabaseOid !== undefined) return fail();
  return mirror.databaseOid;
}
function countsEqual(left: unknown, right: Record<string, number>): boolean {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const values = left as Record<string, unknown>;
  const keys = Object.keys(right);
  return (
    Object.keys(values).length === keys.length && keys.every((key) => values[key] === right[key])
  );
}
/** DB dışında root-owned güncel mirror zorunluluğu eski backup replay'ini kapatır. */
export function admitResetGeneration(
  mirror: ResetGenerationMirror | null,
  evidence: ResetAdmissionEvidence,
  required: boolean,
): "LEGACY" | "RESET" {
  if (!mirror) {
    if (
      required ||
      evidence.commits.length ||
      evidence.exposures.length ||
      evidence.restores.length ||
      evidence.topicTombstones ||
      evidence.entryTombstones
    )
      return fail();
    return "LEGACY";
  }
  if (
    mirror.databaseName !== evidence.databaseName ||
    resetMirrorDatabaseOid(mirror) !== evidence.databaseOid ||
    mirror.clusterId !== evidence.clusterId
  )
    return fail();
  if (mirror.state === "ROLLED_BACK") {
    if (
      evidence.commits.length ||
      evidence.exposures.length ||
      evidence.topicTombstones ||
      evidence.entryTombstones ||
      evidence.openIntents ||
      evidence.restores.length !== 1 ||
      evidence.restores[0]?.operationId !== mirror.operationId ||
      evidence.restores[0]?.dumpSha256 !== mirror.dumpSha256 ||
      evidence.restores[0]?.restoredDatabaseOid !== mirror.restoredDatabaseOid
    )
      return fail();
    return "LEGACY";
  }
  const commit = evidence.commits[0];
  if (
    evidence.commits.length !== 1 ||
    !commit ||
    evidence.restores.length ||
    commit.operationId !== mirror.operationId ||
    commit.releaseSha !== mirror.releaseSha ||
    commit.manifestSha256 !== mirror.manifestSha256 ||
    commit.planSha256 !== mirror.planSha256 ||
    !countsEqual(commit.clearedCounts, mirror.clearedCounts) ||
    evidence.topicTombstones !== mirror.clearedCounts.topics ||
    evidence.entryTombstones !== mirror.clearedCounts.entries
  )
    return fail();
  if (mirror.state === "COMMITTED_MAINTENANCE") {
    if (!evidence.writersFrozen || !evidence.clearedEmpty || evidence.exposures.length)
      return fail();
  } else if (
    evidence.exposures.length !== 1 ||
    evidence.exposures[0]?.operationId !== mirror.operationId ||
    evidence.exposures[0]?.journalSha256 !== mirror.journalSha256
  )
    return fail();
  return "RESET";
}
