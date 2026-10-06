import type { TransactionClient } from "@/lib/db/types";
import {
  admitResetGeneration,
  type ResetGenerationMirror,
} from "../domain/reset-generation-admission";
import { greatResetInspection as inspect } from "./great-reset";
import { assertResetNamespace } from "./great-reset-production";

export async function requireResetGenerationAdmission(
  tx: TransactionClient,
  mirror: ResetGenerationMirror | null,
  required: boolean,
): Promise<void> {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  await tx.$executeRaw`SET LOCAL statement_timeout='10s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout='1s'`;
  const [identity] = await tx.$queryRaw<
    { databaseName: string; databaseOid: string; clusterId: string; journals: boolean }[]
  >`
    SELECT current_database() AS "databaseName", d.oid::text AS "databaseOid", (SELECT system_identifier::text FROM pg_control_system()) AS "clusterId",
      to_regclass('public.great_reset_commits') IS NOT NULL AS journals FROM pg_database d WHERE datname=current_database()`;
  if (!identity) throw new Error("GREAT_RESET_GENERATION_ADMISSION_REJECTED");
  if (!identity.journals) {
    if (mirror || required) throw new Error("GREAT_RESET_GENERATION_ADMISSION_REJECTED");
    return; // İlk kurulum/migration; henüz reset nesli yok.
  }
  let writersFrozen = false,
    clearedEmpty = false;
  if (mirror?.state === "COMMITTED_MAINTENANCE") {
    const flags = await tx.agentGlobalSettings.findMany({
      select: {
        id: true,
        runtimeEnabled: true,
        schedulerEnabled: true,
        publishEnabled: true,
        publicWriteEnabled: true,
      },
    });
    writersFrozen =
      flags.length === 1 &&
      flags[0]?.id === "global" &&
      flags.every(
        (f) =>
          !f.runtimeEnabled && !f.schedulerEnabled && !f.publishEnabled && !f.publicWriteEnabled,
      );
    clearedEmpty = true;
    for (const table of inspect.tables().filter((t) => t.cleared)) {
      const [count] = await tx.$queryRaw<{ rows: number }[]>(inspectTableCount(table.table));
      if (count?.rows !== 0) clearedEmpty = false;
    }
  }
  const commits = await tx.greatResetCommit.findMany({
    select: {
      operationId: true,
      releaseSha: true,
      manifestSha256: true,
      planSha256: true,
      clearedCounts: true,
    },
  });
  const exposures = await tx.greatResetExposureEvent.findMany({
    select: { operationId: true, journalSha256: true },
  });
  const restoreRows = await tx.auditLog.findMany({
    where: { action: "GREAT_RESET_PRODUCTION_RESTORE" },
    select: { entityId: true, metadata: true },
  });
  const restores = restoreRows.map((r) => ({
    operationId: r.entityId ?? "",
    dumpSha256:
      r.metadata &&
      typeof r.metadata === "object" &&
      !Array.isArray(r.metadata) &&
      typeof r.metadata.dumpSha256 === "string"
        ? r.metadata.dumpSha256
        : "",
    restoredDatabaseOid:
      r.metadata &&
      typeof r.metadata === "object" &&
      !Array.isArray(r.metadata) &&
      typeof r.metadata.restoredDatabaseOid === "string"
        ? r.metadata.restoredDatabaseOid
        : "",
  }));
  const phase = admitResetGeneration(
    mirror,
    {
      ...identity,
      commits,
      exposures,
      topicTombstones: await tx.greatResetTombstone.count({ where: { kind: "TOPIC" } }),
      entryTombstones: await tx.greatResetTombstone.count({ where: { kind: "ENTRY" } }),
      writersFrozen,
      clearedEmpty,
      restores,
      openIntents: await tx.greatResetIntent.count({
        where: { consumedAt: null, invalidatedAt: null },
      }),
    },
    required,
  );
  if (mirror) await assertResetNamespace(tx, phase, mirror.state === "TRAFFIC_OPEN");
}
import { Prisma } from "@prisma/client";
function inspectTableCount(table: string) {
  return Prisma.sql`SELECT count(*)::int AS rows FROM ${inspect.tableSql(table)}`;
}
